using Microsoft.AspNetCore.Mvc;
using KnowledgeVault.Api.DTOs;
using KnowledgeVault.Api.Services;

namespace KnowledgeVault.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SearchController : ControllerBase
{
    private readonly SearchService _searchService;

    public SearchController(SearchService searchService)
    {
        _searchService = searchService;
    }

    /// <summary>
    /// Search across nodes, content, OCR text, and tags
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<SearchResultDto>>> Search(
        [FromQuery] string q,
        [FromQuery] int maxResults = 50)
    {
        if (string.IsNullOrWhiteSpace(q))
            return Ok(new List<SearchResultDto>());

        var results = await _searchService.SearchAsync(q, maxResults);
        return Ok(results);
    }
}
