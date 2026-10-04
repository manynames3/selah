export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (context.env.LOCAL_PREVIEW !== "true" || !["localhost", "127.0.0.1"].includes(url.hostname)) return new Response("Not found", { status: 404 });
  const key = context.params.path.join("/");
  const object = await context.env.AUDIO_BUCKET.get(key, { range: context.request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  if (object.range) {
    headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    headers.set("content-length", String(object.range.length));
  } else headers.set("content-length", String(object.size));
  return new Response(object.body, { status: object.range ? 206 : 200, headers });
}
