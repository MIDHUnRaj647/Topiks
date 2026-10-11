namespace KnowledgeVault.Api.DTOs;

using KnowledgeVault.Api.Models;

// ── Response DTOs ──────────────────────────────────────────

public class NodeDto
{
    public Guid Id { get; set; }
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public NodeType NodeType { get; set; }
    public Priority? Priority { get; set; }
    public int SortOrder { get; set; }
    public string? Content { get; set; }
    public string? Tags { get; set; }
    public bool IsFavorite { get; set; }
    public bool HasChildren { get; set; }
    public int ChildCount { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime UpdatedOn { get; set; }
}

public class NodeTreeDto
{
    public Guid Id { get; set; }
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public NodeType NodeType { get; set; }
    public Priority? Priority { get; set; }
    public int SortOrder { get; set; }
    public bool IsFavorite { get; set; }
    public bool HasChildren { get; set; }
    public int ChildCount { get; set; }
    public List<NodeTreeDto> Children { get; set; } = new();
}

public class BreadcrumbDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public NodeType NodeType { get; set; }
}

public class SearchResultDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public NodeType NodeType { get; set; }
    public string? ContentSnippet { get; set; }
    public string MatchSource { get; set; } = string.Empty; // "name", "content", "ocr"
    public List<BreadcrumbDto> Breadcrumbs { get; set; } = new();
}

public class OcrResultDto
{
    public Guid ImportId { get; set; }
    public string ExtractedText { get; set; } = string.Empty;
    public string ImageFileName { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public DateTime ImportedOn { get; set; }
}

public class NodeImageDto
{
    public Guid Id { get; set; }
    public Guid NodeId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime UploadedOn { get; set; }
}

// ── Request DTOs ──────────────────────────────────────────

public class CreateNodeRequest
{
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public NodeType NodeType { get; set; }
    public Priority? Priority { get; set; }
    public string? Content { get; set; }
    public string? Tags { get; set; }
}

public class UpdateNodeRequest
{
    public string? Name { get; set; }
    public Priority? Priority { get; set; }
    public string? Content { get; set; }
    public string? Tags { get; set; }
    public bool? IsFavorite { get; set; }
}

public class ReorderRequest
{
    public List<ReorderItem> Items { get; set; } = new();
}

public class ReorderItem
{
    public Guid Id { get; set; }
    public int SortOrder { get; set; }
    public Guid? NewParentId { get; set; }
}

public class MoveNodeRequest
{
    public Guid? NewParentId { get; set; }
}
