using Microsoft.EntityFrameworkCore;
using KnowledgeVault.Api.Data;
using KnowledgeVault.Api.DTOs;

namespace KnowledgeVault.Api.Services;

public class SearchService
{
    private readonly AppDbContext _db;

    public SearchService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<SearchResultDto>> SearchAsync(string query, int maxResults = 50)
    {
        if (string.IsNullOrWhiteSpace(query))
            return new List<SearchResultDto>();

        var searchTerm = query.Trim().ToLower();
        var results = new List<SearchResultDto>();

        // Search by name
        var nameMatches = await _db.Nodes
            .Where(n => n.Name.ToLower().Contains(searchTerm))
            .Take(maxResults)
            .ToListAsync();

        foreach (var node in nameMatches)
        {
            results.Add(new SearchResultDto
            {
                Id = node.Id,
                Name = node.Name,
                NodeType = node.NodeType,
                MatchSource = "name",
                Breadcrumbs = await GetBreadcrumbsAsync(node.Id)
            });
        }

        // Search by content (strip HTML tags for snippet)
        var contentMatches = await _db.Nodes
            .Where(n => n.Content != null && n.Content.ToLower().Contains(searchTerm))
            .Where(n => !nameMatches.Select(nm => nm.Id).Contains(n.Id))
            .Take(maxResults)
            .ToListAsync();

        foreach (var node in contentMatches)
        {
            results.Add(new SearchResultDto
            {
                Id = node.Id,
                Name = node.Name,
                NodeType = node.NodeType,
                ContentSnippet = ExtractSnippet(node.Content, searchTerm),
                MatchSource = "content",
                Breadcrumbs = await GetBreadcrumbsAsync(node.Id)
            });
        }

        // Search by OCR extracted text
        var ocrMatches = await _db.NodeOcrImports
            .Where(o => o.ExtractedText.ToLower().Contains(searchTerm))
            .Include(o => o.Node)
            .Take(maxResults)
            .ToListAsync();

        var existingIds = results.Select(r => r.Id).ToHashSet();
        foreach (var ocr in ocrMatches)
        {
            if (!existingIds.Contains(ocr.NodeId))
            {
                results.Add(new SearchResultDto
                {
                    Id = ocr.NodeId,
                    Name = ocr.Node.Name,
                    NodeType = ocr.Node.NodeType,
                    ContentSnippet = ExtractSnippet(ocr.ExtractedText, searchTerm),
                    MatchSource = "ocr",
                    Breadcrumbs = await GetBreadcrumbsAsync(ocr.NodeId)
                });
                existingIds.Add(ocr.NodeId);
            }
        }

        // Search by tags
        var tagMatches = await _db.Nodes
            .Where(n => n.Tags != null && n.Tags.ToLower().Contains(searchTerm))
            .Take(maxResults)
            .ToListAsync();

        foreach (var node in tagMatches)
        {
            if (!existingIds.Contains(node.Id))
            {
                results.Add(new SearchResultDto
                {
                    Id = node.Id,
                    Name = node.Name,
                    NodeType = node.NodeType,
                    ContentSnippet = $"Tags: {node.Tags}",
                    MatchSource = "tags",
                    Breadcrumbs = await GetBreadcrumbsAsync(node.Id)
                });
                existingIds.Add(node.Id);
            }
        }

        return results.Take(maxResults).ToList();
    }

    private async Task<List<BreadcrumbDto>> GetBreadcrumbsAsync(Guid nodeId)
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

    private static string? ExtractSnippet(string? content, string searchTerm, int snippetLength = 150)
    {
        if (string.IsNullOrEmpty(content)) return null;

        // Strip HTML tags for search snippet
        var plainText = System.Text.RegularExpressions.Regex.Replace(content, "<[^>]+>", " ");
        plainText = System.Text.RegularExpressions.Regex.Replace(plainText, @"\s+", " ").Trim();

        var index = plainText.ToLower().IndexOf(searchTerm);
        if (index < 0) return plainText.Length > snippetLength
            ? plainText[..snippetLength] + "..."
            : plainText;

        var start = Math.Max(0, index - 50);
        var end = Math.Min(plainText.Length, index + searchTerm.Length + 100);

        var snippet = plainText[start..end];
        if (start > 0) snippet = "..." + snippet;
        if (end < plainText.Length) snippet += "...";

        return snippet;
    }
}
