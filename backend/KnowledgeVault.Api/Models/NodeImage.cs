using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace KnowledgeVault.Api.Models;

public class NodeImage
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid NodeId { get; set; }

    [ForeignKey("NodeId")]
    public Node Node { get; set; } = null!;

    [Required]
    [MaxLength(500)]
    public string FileName { get; set; } = string.Empty;

    [Required]
    [MaxLength(1000)]
    public string FilePath { get; set; } = string.Empty;

    public DateTime UploadedOn { get; set; } = DateTime.UtcNow;
}
