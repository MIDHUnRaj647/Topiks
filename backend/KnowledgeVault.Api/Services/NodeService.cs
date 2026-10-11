using Microsoft.EntityFrameworkCore;
using KnowledgeVault.Api.Data;
using KnowledgeVault.Api.DTOs;
using KnowledgeVault.Api.Models;

namespace KnowledgeVault.Api.Services;

public class NodeService
{
    private readonly AppDbContext _db;

    public NodeService(AppDbContext db)
    {
        _db = db;
    }

    // ── Query Methods ────────────────────────────────────────

    public async Task<List<NodeDto>> GetRootNodesAsync()
    {
        return await _db.Nodes
            .Where(n => n.ParentId == null)
            .OrderBy(n => n.SortOrder)
            .Select(n => MapToDto(n))
            .ToListAsync();
    }

    public async Task<NodeDto?> GetNodeAsync(Guid id)
    {
        var node = await _db.Nodes
            .Include(n => n.Children)
            .FirstOrDefaultAsync(n => n.Id == id);

        return node == null ? null : MapToDto(node);
    }

    public async Task<List<NodeDto>> GetChildrenAsync(Guid parentId)
    {
        return await _db.Nodes
            .Where(n => n.ParentId == parentId)
            .OrderBy(n => n.SortOrder)
            .Select(n => MapToDto(n))
            .ToListAsync();
    }

    public async Task<NodeTreeDto?> GetTreeAsync(Guid id)
    {
        var node = await _db.Nodes.FindAsync(id);
        if (node == null) return null;

        return await BuildTreeAsync(node);
    }

    public async Task<List<NodeTreeDto>> GetFullTreeAsync()
    {
        var rootNodes = await _db.Nodes
            .Where(n => n.ParentId == null)
            .OrderBy(n => n.SortOrder)
            .ToListAsync();

        var result = new List<NodeTreeDto>();
        foreach (var root in rootNodes)
        {
            result.Add(await BuildTreeAsync(root));
        }
        return result;
    }

    public async Task<List<NodeDto>> GetFavoritesAsync()
    {
        return await _db.Nodes
            .Where(n => n.IsFavorite)
            .OrderBy(n => n.Name)
            .Select(n => MapToDto(n))
            .ToListAsync();
    }

    public async Task<List<BreadcrumbDto>> GetBreadcrumbsAsync(Guid nodeId)
    {
        var breadcrumbs = new List<BreadcrumbDto>();
        var current = await _db.Nodes.FindAsync(nodeId);

        while (current != null)
        {
            breadcrumbs.Insert(0, new BreadcrumbDto
            {
                Id = current.Id,
                Name = current.Name,
                NodeType = current.NodeType
            });

            current = current.ParentId.HasValue
                ? await _db.Nodes.FindAsync(current.ParentId.Value)
                : null;
        }

        return breadcrumbs;
    }

    // ── Command Methods ──────────────────────────────────────

    public async Task<NodeDto> CreateNodeAsync(CreateNodeRequest request)
    {
        // Get max sort order for siblings
        var maxSort = await _db.Nodes
            .Where(n => n.ParentId == request.ParentId)
            .MaxAsync(n => (int?)n.SortOrder) ?? -1;

        var node = new Node
        {
            Name = request.Name,
            ParentId = request.ParentId,
            NodeType = request.NodeType,
            Priority = request.Priority,
            Content = request.Content,
            Tags = request.Tags,
            SortOrder = maxSort + 1,
            CreatedOn = DateTime.UtcNow,
            UpdatedOn = DateTime.UtcNow
        };

        _db.Nodes.Add(node);
        await _db.SaveChangesAsync();

        return MapToDto(node);
    }

    public async Task<NodeDto?> UpdateNodeAsync(Guid id, UpdateNodeRequest request)
    {
        var node = await _db.Nodes
            .Include(n => n.Children)
            .FirstOrDefaultAsync(n => n.Id == id);

        if (node == null) return null;

        if (request.Name != null) node.Name = request.Name;
        if (request.Priority.HasValue) node.Priority = request.Priority;
        if (request.Content != null) node.Content = request.Content;
        if (request.Tags != null) node.Tags = request.Tags;
        if (request.IsFavorite.HasValue) node.IsFavorite = request.IsFavorite.Value;
        node.UpdatedOn = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return MapToDto(node);
    }

    public async Task<bool> DeleteNodeAsync(Guid id)
    {
        var node = await _db.Nodes.FindAsync(id);
        if (node == null) return false;

        // Recursively delete children
        await DeleteChildrenRecursive(id);

        _db.Nodes.Remove(node);
        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> ReorderNodesAsync(ReorderRequest request)
    {
        foreach (var item in request.Items)
        {
            var node = await _db.Nodes.FindAsync(item.Id);
            if (node == null) continue;

            node.SortOrder = item.SortOrder;
            if (item.NewParentId.HasValue || item.NewParentId == null)
            {
                node.ParentId = item.NewParentId;
            }
            node.UpdatedOn = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> MoveNodeAsync(Guid id, MoveNodeRequest request)
    {
        var node = await _db.Nodes.FindAsync(id);
        if (node == null) return false;

        // Prevent moving a node into its own subtree
        if (request.NewParentId.HasValue)
        {
            if (await IsDescendant(id, request.NewParentId.Value))
                return false;
        }

        // Get max sort order in the new parent
        var maxSort = await _db.Nodes
            .Where(n => n.ParentId == request.NewParentId)
            .MaxAsync(n => (int?)n.SortOrder) ?? -1;

        node.ParentId = request.NewParentId;
        node.SortOrder = maxSort + 1;
        node.UpdatedOn = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> ClearAllNodesAsync()
    {
        await _db.Database.ExecuteSqlRawAsync("DELETE FROM NodeImages;");
        await _db.Database.ExecuteSqlRawAsync("DELETE FROM NodeOcrImports;");
        await _db.Database.ExecuteSqlRawAsync("DELETE FROM Nodes;");
        return true;
    }

    // ── Private Helpers ──────────────────────────────────────

    private async Task DeleteChildrenRecursive(Guid parentId)
    {
        var children = await _db.Nodes
            .Where(n => n.ParentId == parentId)
            .ToListAsync();

        foreach (var child in children)
        {
            await DeleteChildrenRecursive(child.Id);
            _db.Nodes.Remove(child);
        }
    }

    private async Task<bool> IsDescendant(Guid ancestorId, Guid potentialDescendantId)
    {
        var current = await _db.Nodes.FindAsync(potentialDescendantId);
        while (current != null)
        {
            if (current.Id == ancestorId) return true;
            current = current.ParentId.HasValue
                ? await _db.Nodes.FindAsync(current.ParentId.Value)
                : null;
        }
        return false;
    }

    private async Task<NodeTreeDto> BuildTreeAsync(Node node)
    {
        var children = await _db.Nodes
            .Where(n => n.ParentId == node.Id)
            .OrderBy(n => n.SortOrder)
            .ToListAsync();

        var treeDto = new NodeTreeDto
        {
            Id = node.Id,
            ParentId = node.ParentId,
            Name = node.Name,
            NodeType = node.NodeType,
            Priority = node.Priority,
            SortOrder = node.SortOrder,
            IsFavorite = node.IsFavorite,
            HasChildren = children.Any(),
            ChildCount = children.Count
        };

        foreach (var child in children)
        {
            treeDto.Children.Add(await BuildTreeAsync(child));
        }

        return treeDto;
    }

    private static NodeDto MapToDto(Node node)
    {
        return new NodeDto
        {
            Id = node.Id,
            ParentId = node.ParentId,
            Name = node.Name,
            NodeType = node.NodeType,
            Priority = node.Priority,
            SortOrder = node.SortOrder,
            Content = node.Content,
            Tags = node.Tags,
            IsFavorite = node.IsFavorite,
            HasChildren = node.Children?.Any() ?? false,
            ChildCount = node.Children?.Count ?? 0,
            CreatedOn = node.CreatedOn,
            UpdatedOn = node.UpdatedOn
        };
    }
}
