// D-0131: upload files grouped into request bodies within the cap, measured as the JSON the client sends.
import { describe, expect, it } from "vite-plus/test";

import { MAX_BODY_BYTES, splitUpload } from "../src/index.ts";

// `{"name":"a","html":"xx"}` is 24 bytes; `{"files":[…]}` adds 12, and each further file a comma.
const file = (name: string, html = "xx") => ({ name, html });

describe("splitUpload", () => {
  it("fills each request up to the cap, keeping the files in order", () => {
    const files = [file("a"), file("b"), file("c")];

    expect(splitUpload(files, 61)).toEqual({ requests: [[file("a"), file("b")], [file("c")]], tooLarge: [] });
    expect(splitUpload(files, 60)).toEqual({ requests: [[file("a")], [file("b")], [file("c")]], tooLarge: [] });
    expect(splitUpload(files, 86)).toEqual({ requests: [files], tooLarge: [] });
  });

  it("counts JSON escapes and UTF-8 bytes, not characters", () => {
    // `{"name":"a","html":"é\""}`: é is 2 bytes and the escaped quote 2, so 26 bytes, 38 with the envelope.
    const escaped = file("a", 'é"');

    expect(splitUpload([escaped], 38)).toEqual({ requests: [[escaped]], tooLarge: [] });
    expect(splitUpload([escaped], 37)).toEqual({ requests: [], tooLarge: [escaped] });
  });

  it("holds back a file that alone passes the cap and sends the rest", () => {
    const big = file("big", "x".repeat(100));

    expect(splitUpload([file("a"), big, file("b")], 61)).toEqual({
      requests: [[file("a"), file("b")]],
      tooLarge: [big],
    });
  });

  it("uses the API's 10 MB cap by default", () => {
    expect(MAX_BODY_BYTES).toBe(10_485_760);
    const files = [file("a", "x".repeat(6_000_000)), file("b", "x".repeat(6_000_000))];

    expect(splitUpload(files).requests.map((r) => r.map((f) => f.name))).toEqual([["a"], ["b"]]);
  });
});
