using Microsoft.EntityFrameworkCore;
using KnowledgeVault.Api.Data;
using KnowledgeVault.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Database ─────────────────────────────────────────────
var dbPath = Path.Combine(builder.Environment.ContentRootPath, "data", "knowledgevault.db");
Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite($"Data Source={dbPath}"));

// ── Services ─────────────────────────────────────────────
builder.Services.AddScoped<NodeService>();
builder.Services.AddScoped<SearchService>();

// ── Controllers ──────────────────────────────────────────
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

// ── CORS ─────────────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngular", policy =>
    {
        policy.SetIsOriginAllowed(origin => true)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });

    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// ── Database Migration ───────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

// ── Middleware Pipeline ──────────────────────────────────
app.UseCors("AllowAngular");

// Prevent any caching of API responses
app.Use(async (context, next) =>
{
    context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0";
    context.Response.Headers["Pragma"] = "no-cache";
    context.Response.Headers["Expires"] = "0";
    await next();
});

// ── Storage directories ──────────────────────────────────
var storageRoot = Path.Combine(builder.Environment.ContentRootPath, "storage");
var storagePaths = new[] { "images", "ocr", "exports", "thumbnails" };
Directory.CreateDirectory(storageRoot);
foreach (var sub in storagePaths)
{
    Directory.CreateDirectory(Path.Combine(storageRoot, sub));
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(storageRoot),
    RequestPath = "/storage"
});

app.MapControllers();

app.Run();
