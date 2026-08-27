import { afterEach, describe, expect, it, vi } from "vitest";
import { OutlookProvider } from "../src/providers/outlook";

function stubGraph(): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify({ value: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe("OutlookProvider.search", () => {
  const provider = () => new OutlookProvider("a@example.com", async () => "token");

  it("lists the inbox when there is no query, rather than sending an empty $search", async () => {
    const urls = stubGraph();
    await provider().search("", 10);
    expect(urls).toHaveLength(1);
    expect(urls[0]).not.toContain("$search");
    expect(urls[0]).toContain("/me/mailFolders/inbox/messages");
    expect(urls[0]).toContain("$top=10");
  });

  it("treats a whitespace-only query the same way", async () => {
    const urls = stubGraph();
    await provider().search("   ");
    expect(urls[0]).not.toContain("$search");
  });

  it("searches with KQL when there is a query", async () => {
    const urls = stubGraph();
    await provider().search("from:jane", 5);
    expect(urls[0]).toContain("$search=%22from%3Ajane%22");
  });
});
