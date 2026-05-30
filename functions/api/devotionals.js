import { listDevotionals } from "./_db.js";

export async function onRequestGet(context) {
  try {
    return new Response(JSON.stringify(await listDevotionals(context.env)), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return Response.json(
      { error: "d1-query-failed", message: String(error && error.message || error) },
      {
        status: 500,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
