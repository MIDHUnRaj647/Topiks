using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KnowledgeVault.Api.Data;
using KnowledgeVault.Api.DTOs;
using KnowledgeVault.Api.Models;

namespace KnowledgeVault.Api.Controllers;

[ApiController]
[Route("api/nodes/{nodeId:guid}/ocr")]
public class OcrController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public OcrController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    /// <summary>
    /// Upload an image and extract text via OCR.
    /// For now, this stores the image and returns a placeholder.
    /// Tesseract integration can be added when the native library is available.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<OcrResultDto>> UploadAndExtract(
        Guid nodeId,
        [FromForm] IFormFile file)
    {
        var node = await _db.Nodes.FindAsync(nodeId);
        if (node == null) return NotFound("Node not found");

        if (file == null || file.Length == 0)
            return BadRequest("No file uploaded");

        // Validate file type
        var allowedTypes = new[] { ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".gif", ".webp" };
        var ext = Path.GetExtension(file.FileName).ToLower();
        if (!allowedTypes.Contains(ext))
            return BadRequest("Unsupported file type. Use JPG, PNG, BMP, TIFF, GIF, or WebP.");

        // Save file to storage
        var storagePath = Path.Combine(_env.ContentRootPath, "storage", "ocr");
        Directory.CreateDirectory(storagePath);

        var uniqueFileName = $"{Guid.NewGuid()}{ext}";
        var filePath = Path.Combine(storagePath, uniqueFileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        // Save image reference
        var nodeImage = new NodeImage
        {
            NodeId = nodeId,
            FileName = file.FileName,
            FilePath = filePath,
            UploadedOn = DateTime.UtcNow
        };
        _db.NodeImages.Add(nodeImage);

        // OCR Processing
        // If client-side OCR (Tesseract.js) already extracted text, persist that; otherwise fallback
        var formExtractedText = Request.Form["extractedText"].ToString();
        var finalText = !string.IsNullOrWhiteSpace(formExtractedText)
            ? formExtractedText.Trim()
            : string.Empty;

        // Store OCR import history
        var ocrImport = new NodeOcrImport
        {
            NodeId = nodeId,
            ImageFileName = file.FileName,
            ExtractedText = finalText,
            ImportedOn = DateTime.UtcNow
        };
        _db.NodeOcrImports.Add(ocrImport);

        await _db.SaveChangesAsync();

        var baseUrl = $"{Request.Scheme}://{Request.Host}";
        var imageUrl = $"{baseUrl}/api/images/{nodeImage.Id}";

        return Ok(new OcrResultDto
        {
            ImportId = ocrImport.Id,
            ExtractedText = finalText,
            ImageFileName = file.FileName,
            ImageUrl = imageUrl,
            ImportedOn = ocrImport.ImportedOn
        });
    }

    /// <summary>
    /// Get OCR import history for a node
    /// </summary>
    [HttpGet("history")]
    public async Task<ActionResult<List<OcrResultDto>>> GetOcrHistory(Guid nodeId)
    {
        var baseUrl = $"{Request.Scheme}://{Request.Host}";
        var images = await _db.NodeImages
            .Where(i => i.NodeId == nodeId)
            .ToDictionaryAsync(i => i.FileName, i => $"{baseUrl}/api/images/{i.Id}");

        var history = await _db.NodeOcrImports
            .Where(o => o.NodeId == nodeId)
            .OrderByDescending(o => o.ImportedOn)
            .Select(o => new OcrResultDto
            {
                ImportId = o.Id,
                ExtractedText = o.ExtractedText,
                ImageFileName = o.ImageFileName,
                ImageUrl = images.ContainsKey(o.ImageFileName) ? images[o.ImageFileName] : null,
                ImportedOn = o.ImportedOn
            })
            .ToListAsync();

        return Ok(history);
    }
}
