using Microsoft.AspNetCore.Mvc;
using KnowledgeVault.Api.DTOs;
using KnowledgeVault.Api.Services;

namespace KnowledgeVault.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class NodesController : ControllerBase
{
    private readonly NodeService _nodeService;

    public NodesController(NodeService nodeService)
    {
        _nodeService = nodeService;
    }

    /// <summary>
    /// Get all root-level nodes (Books)
    /// </summary>
    [HttpGet("root")]
    public async Task<ActionResult<List<NodeDto>>> GetRootNodes()
    {
        var nodes = await _nodeService.GetRootNodesAsync();
        return Ok(nodes);
    }

    /// <summary>
    /// Get a single node by ID (includes content)
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<NodeDto>> GetNode(Guid id)
    {
        var node = await _nodeService.GetNodeAsync(id);
        if (node == null) return NotFound();
        return Ok(node);
    }

    /// <summary>
    /// Get children of a node
    /// </summary>
    [HttpGet("{id:guid}/children")]
    public async Task<ActionResult<List<NodeDto>>> GetChildren(Guid id)
    {
        var children = await _nodeService.GetChildrenAsync(id);
        return Ok(children);
    }

    /// <summary>
    /// Get full subtree from a node
    /// </summary>
    [HttpGet("{id:guid}/tree")]
    public async Task<ActionResult<NodeTreeDto>> GetTree(Guid id)
    {
        var tree = await _nodeService.GetTreeAsync(id);
        if (tree == null) return NotFound();
        return Ok(tree);
    }

    /// <summary>
    /// Get the entire tree (all roots with children)
    /// </summary>
    [HttpGet("tree")]
    public async Task<ActionResult<List<NodeTreeDto>>> GetFullTree()
    {
        var tree = await _nodeService.GetFullTreeAsync();
        return Ok(tree);
    }

    /// <summary>
    /// Get breadcrumb path for a node
    /// </summary>
    [HttpGet("{id:guid}/breadcrumbs")]
    public async Task<ActionResult<List<BreadcrumbDto>>> GetBreadcrumbs(Guid id)
    {
        var breadcrumbs = await _nodeService.GetBreadcrumbsAsync(id);
        return Ok(breadcrumbs);
    }

    /// <summary>
    /// Get all favorited nodes
    /// </summary>
    [HttpGet("favorites")]
    public async Task<ActionResult<List<NodeDto>>> GetFavorites()
    {
        var favorites = await _nodeService.GetFavoritesAsync();
        return Ok(favorites);
    }

    /// <summary>
    /// Create a new node
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<NodeDto>> CreateNode([FromBody] CreateNodeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest("Name is required");

        var node = await _nodeService.CreateNodeAsync(request);
        return CreatedAtAction(nameof(GetNode), new { id = node.Id }, node);
    }

    /// <summary>
    /// Update an existing node
    /// </summary>
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<NodeDto>> UpdateNode(Guid id, [FromBody] UpdateNodeRequest request)
    {
        var node = await _nodeService.UpdateNodeAsync(id, request);
        if (node == null) return NotFound();
        return Ok(node);
    }

    /// <summary>
    /// Delete a node and all its children
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> DeleteNode(Guid id)
    {
        var success = await _nodeService.DeleteNodeAsync(id);
        if (!success) return NotFound();
        return NoContent();
    }

    /// <summary>
    /// Reorder nodes (for drag & drop)
    /// </summary>
    [HttpPut("reorder")]
    public async Task<ActionResult> ReorderNodes([FromBody] ReorderRequest request)
    {
        var success = await _nodeService.ReorderNodesAsync(request);
        return success ? Ok() : BadRequest();
    }

    /// <summary>
    /// Move a node to a different parent
    /// </summary>
    [HttpPut("{id:guid}/move")]
    public async Task<ActionResult> MoveNode(Guid id, [FromBody] MoveNodeRequest request)
    {
        var success = await _nodeService.MoveNodeAsync(id, request);
        if (!success) return BadRequest("Cannot move node into its own subtree");
        return Ok();
    }

    /// <summary>
    /// Wipe all nodes, images, and OCR entries to start fresh with a clean database
    /// </summary>
    [HttpDelete("all")]
    public async Task<ActionResult> ClearAllNodes()
    {
        await _nodeService.ClearAllNodesAsync();
        return NoContent();
    }
}
