using Microsoft.EntityFrameworkCore;
using KnowledgeVault.Api.Models;

namespace KnowledgeVault.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Node> Nodes => Set<Node>();
    public DbSet<NodeImage> NodeImages => Set<NodeImage>();
    public DbSet<NodeOcrImport> NodeOcrImports => Set<NodeOcrImport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Self-referencing relationship
        modelBuilder.Entity<Node>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasOne(e => e.Parent)
                .WithMany(e => e.Children)
                .HasForeignKey(e => e.ParentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ParentId);
            entity.HasIndex(e => e.NodeType);
            entity.HasIndex(e => e.SortOrder);
            entity.HasIndex(e => e.IsFavorite);
            entity.HasIndex(e => e.Name);

            entity.Property(e => e.Name).IsRequired().HasMaxLength(500);
            entity.Property(e => e.Content).HasColumnType("TEXT");
            entity.Property(e => e.Tags).HasMaxLength(2000);
        });

        modelBuilder.Entity<NodeImage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasOne(e => e.Node)
                .WithMany(e => e.Images)
                .HasForeignKey(e => e.NodeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<NodeOcrImport>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasOne(e => e.Node)
                .WithMany(e => e.OcrImports)
                .HasForeignKey(e => e.NodeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Seed data with sample knowledge base
        SeedData(modelBuilder);
    }

    private static void SeedData(ModelBuilder modelBuilder)
    {
        var angularId = Guid.Parse("a1000000-0000-0000-0000-000000000001");
        var servicesId = Guid.Parse("a1000000-0000-0000-0000-000000000002");
        var componentsId = Guid.Parse("a1000000-0000-0000-0000-000000000003");
        var diId = Guid.Parse("a1000000-0000-0000-0000-000000000004");
        var httpId = Guid.Parse("a1000000-0000-0000-0000-000000000005");
        var dotnetId = Guid.Parse("a1000000-0000-0000-0000-000000000006");
        var apiId = Guid.Parse("a1000000-0000-0000-0000-000000000007");
        var efId = Guid.Parse("a1000000-0000-0000-0000-000000000008");
        var sqlId = Guid.Parse("a1000000-0000-0000-0000-000000000009");

        var now = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        modelBuilder.Entity<Node>().HasData(
            // Root Books
            new Node
            {
                Id = angularId, ParentId = null, Name = "Angular",
                NodeType = NodeType.Book, SortOrder = 0,
                Tags = "Angular,Frontend,TypeScript",
                CreatedOn = now, UpdatedOn = now
            },
            new Node
            {
                Id = dotnetId, ParentId = null, Name = ".NET",
                NodeType = NodeType.Book, SortOrder = 1,
                Tags = ".NET,Backend,CSharp",
                CreatedOn = now, UpdatedOn = now
            },
            new Node
            {
                Id = sqlId, ParentId = null, Name = "SQL",
                NodeType = NodeType.Book, SortOrder = 2,
                Tags = "SQL,Database",
                CreatedOn = now, UpdatedOn = now
            },

            // Angular > Chapters
            new Node
            {
                Id = servicesId, ParentId = angularId, Name = "Services",
                NodeType = NodeType.Chapter, SortOrder = 0,
                CreatedOn = now, UpdatedOn = now
            },
            new Node
            {
                Id = componentsId, ParentId = angularId, Name = "Components",
                NodeType = NodeType.Chapter, SortOrder = 1,
                CreatedOn = now, UpdatedOn = now
            },

            // Angular > Services > Topics
            new Node
            {
                Id = diId, ParentId = servicesId, Name = "Dependency Injection",
                NodeType = NodeType.Topic, SortOrder = 0, Priority = Models.Priority.High,
                IsFavorite = true,
                Content = "<h2>Angular Dependency Injection</h2><p>Dependency Injection (DI) is a design pattern in which a class asks for dependencies from external sources rather than creating them.</p><ul><li><strong>Singleton Services</strong> — One instance shared across the entire app</li><li><strong>Scoped Services</strong> — One instance per component tree</li><li><strong>Transient Services</strong> — New instance every time</li></ul><p>Use the <code>@Injectable()</code> decorator to make a service injectable.</p>",
                Tags = "Angular,DI,Services",
                CreatedOn = now, UpdatedOn = now
            },
            new Node
            {
                Id = httpId, ParentId = servicesId, Name = "HTTP Client",
                NodeType = NodeType.Topic, SortOrder = 1, Priority = Models.Priority.Medium,
                Content = "<h2>Angular HTTP Client</h2><p>The <code>HttpClient</code> service is used to communicate with backend services via HTTP.</p><h3>Key Features</h3><ul><li>Request typed responses</li><li>Interceptors for auth tokens</li><li>Error handling with RxJS</li><li>Request/response transformation</li></ul>",
                Tags = "Angular,HTTP,API",
                CreatedOn = now, UpdatedOn = now
            },

            // .NET > Chapters
            new Node
            {
                Id = apiId, ParentId = dotnetId, Name = "Web API",
                NodeType = NodeType.Chapter, SortOrder = 0,
                Content = "<h2>ASP.NET Core Web API</h2><p>Build RESTful services using ASP.NET Core. Features include:</p><ul><li>Minimal APIs and Controller-based APIs</li><li>Model binding and validation</li><li>Content negotiation</li><li>Dependency injection built-in</li></ul>",
                Tags = ".NET,API,REST",
                CreatedOn = now, UpdatedOn = now
            },
            new Node
            {
                Id = efId, ParentId = dotnetId, Name = "Entity Framework",
                NodeType = NodeType.Chapter, SortOrder = 1,
                Content = "<h2>Entity Framework Core</h2><p>EF Core is a modern ORM for .NET.</p><h3>Approaches</h3><ul><li><strong>Code First</strong> — Define models, generate database</li><li><strong>Database First</strong> — Generate models from existing DB</li></ul><h3>Key Concepts</h3><ul><li>DbContext and DbSet</li><li>Migrations</li><li>LINQ queries</li><li>Change tracking</li></ul>",
                Tags = ".NET,EFCore,ORM",
                CreatedOn = now, UpdatedOn = now
            }
        );
    }
}
