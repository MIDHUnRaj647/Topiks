using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KnowledgeVault.Api.Models;

public class NodeOcrImport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid NodeId { get; set; }

    [ForeignKey("NodeId")]
    public Node Node { get; set; } = null!;

    [Required]
    [MaxLength(500)]
    public string ImageFileName { get; set; } = string.Empty;

    [Required]
    public string ExtractedText { get; set; } = string.Empty;

    public DateTime ImportedOn { get; set; } = DateTime.UtcNow;
}
