using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KnowledgeVault.Api.Data;
using KnowledgeVault.Api.DTOs;
using KnowledgeVault.Api.Models;

namespace KnowledgeVault.Api.Controllers;

[ApiController]
public class ImagesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public ImagesController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    /// <summary>
    /// Get all images uploaded for a specific node
    /// </summary>
    [HttpGet("api/nodes/{nodeId:guid}/images")]
    public async Task<ActionResult<List<NodeImageDto>>> GetNodeImages(Guid nodeId)
    {
        var images = await _db.NodeImages
            .Where(i => i.NodeId == nodeId)
            .OrderByDescending(i => i.UploadedOn)
            .ToListAsync();

        var baseUrl = $"{Request.Scheme}://{Request.Host}";
        var result = images.Select(i => new NodeImageDto
        {
            Id = i.Id,
            NodeId = i.NodeId,
            FileName = i.FileName,
            Url = $"{baseUrl}/api/images/{i.Id}",
            SizeBytes = System.IO.File.Exists(i.FilePath) ? new FileInfo(i.FilePath).Length : 0,
            UploadedOn = i.UploadedOn
        }).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Upload an image for a specific node (supports standard form & CKEditor upload)
    /// </summary>
    [HttpPost("api/nodes/{nodeId:guid}/images")]
    public async Task<IActionResult> UploadImage(
        Guid nodeId,
        [FromForm] IFormFile? file,
        [FromForm] IFormFile? upload) // CKEditor standard parameter name
    {
        var targetFile = file ?? upload;
        if (targetFile == null || targetFile.Length == 0)
        {
            return BadRequest(new { error = "No file was uploaded." });
        }

        var node = await _db.Nodes.FindAsync(nodeId);
        if (node == null)
        {
            return NotFound(new { error = "Node not found." });
        }

        var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg" };
        var ext = Path.GetExtension(targetFile.FileName).ToLowerInvariant();
        if (!allowedExtensions.Contains(ext))
        {
            return BadRequest(new { error = $"Unsupported image format. Allowed formats: {string.Join(", ", allowedExtensions)}" });
        }

        var storageFolder = Path.Combine(_env.ContentRootPath, "storage", "images");
        Directory.CreateDirectory(storageFolder);

        var uniqueFileName = $"{Guid.NewGuid()}{ext}";
        var fullPath = Path.Combine(storageFolder, uniqueFileName);

        using (var stream = new FileStream(fullPath, FileMode.Create))
        {
            await targetFile.CopyToAsync(stream);
        }

        var nodeImage = new NodeImage
        {
            NodeId = nodeId,
            FileName = targetFile.FileName,
            FilePath = fullPath,
            UploadedOn = DateTime.UtcNow
        };

        _db.NodeImages.Add(nodeImage);
        await _db.SaveChangesAsync();

        var baseUrl = $"{Request.Scheme}://{Request.Host}";
        var imageUrl = $"{baseUrl}/api/images/{nodeImage.Id}";

        // CKEditor expects { url: "..." } or { default: "..." }
        if (upload != null)
        {
            return Ok(new
            {
                url = imageUrl,
                @default = imageUrl
            });
        }

        return Ok(new NodeImageDto
        {
            Id = nodeImage.Id,
            NodeId = nodeImage.NodeId,
            FileName = nodeImage.FileName,
            Url = imageUrl,
            SizeBytes = targetFile.Length,
            UploadedOn = nodeImage.UploadedOn
        });
    }

    /// <summary>
    /// Stream image file by ID
    /// </summary>
    [HttpGet("api/images/{id:guid}")]
    public async Task<IActionResult> GetImage(Guid id)
    {
        var nodeImage = await _db.NodeImages.FindAsync(id);
        if (nodeImage == null || !System.IO.File.Exists(nodeImage.FilePath))
        {
            return NotFound("Image not found");
        }

        var contentType = GetContentType(nodeImage.FilePath);
        return PhysicalFile(nodeImage.FilePath, contentType, enableRangeProcessing: true);
    }

    /// <summary>
    /// Delete an image
    /// </summary>
    [HttpDelete("api/images/{id:guid}")]
    public async Task<IActionResult> DeleteImage(Guid id)
    {
        var nodeImage = await _db.NodeImages.FindAsync(id);
        if (nodeImage == null) return NotFound("Image not found");

        if (System.IO.File.Exists(nodeImage.FilePath))
        {
            try { System.IO.File.Delete(nodeImage.FilePath); } catch { }
        }

        _db.NodeImages.Remove(nodeImage);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    private static string GetContentType(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".bmp" => "image/bmp",
            ".svg" => "image/svg+xml",
            _ => "application/octet-stream"
        };
    }
}
