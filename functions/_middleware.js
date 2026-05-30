function removeLegacySupabaseBootstrap(html) {
  return html
    .replace(
      /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>\n/,
      ""
    )
    .replace(
      /const SUPABASE_URL[\s\S]*?const DEVOTIONALS_REST_URL[^\n]*\n/,
      ""
    )
    .replace(
      /const sb = supabase\.createClient\(SUPABASE_URL, SUPABASE_ANON\);\n/,
      ""
    )
    .replace(
      /function extractSupabasePublicObjectKey[\s\S]*?\n}\nasync function readJsonResponse/,
      "async function readJsonResponse"
    )
    .replace(
      /async function fetchEntriesViaClient[\s\S]*?async function fetchEntriesViaFunction/,
      "async function fetchEntriesViaFunction"
    )
    .replace(
      /var data = await Promise\.any\(\[\s*fetchEntriesViaFunction\(6000\),\s*fetchEntriesViaRest\(12000\),\s*fetchEntriesViaClient\(12000\)\s*\]\);/,
      "var data = await fetchEntriesViaFunction(10000);"
    );
}

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);

  if (
    context.request.method !== "GET" ||
    (url.pathname !== "/" && url.pathname !== "/index.html")
  ) {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(removeLegacySupabaseBootstrap(await response.text()), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
