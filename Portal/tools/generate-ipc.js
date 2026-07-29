import fs from "node:fs";
import path from "node:path";

const SCHEMA_PATH = path.resolve("ipc/channels.schema.json");

if (!fs.existsSync(SCHEMA_PATH)) {
  console.error("[IPC] Missing schema:", SCHEMA_PATH);
  process.exit(1);
}
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));

type TypeShape = {
  out: string;
  opt: boolean;
};

function tsType(t?: string): TypeShape {
  if (!t || t === "{}") return { out: "Record<string, never>", opt: false };
  const opt = t.endsWith("?");
  const base = opt ? t.slice(0, -1) : t;
  let out = "unknown";
  if (base === "string") out = "string";
  else if (base === "number") out = "number";
  else if (base.startsWith("enum:"))
    out = base
      .replace("enum:", "")
      .split("|")
      .map((s) => `"${s}"`)
      .join(" | ");
  return { out, opt };
}

function genTS() {
  const entries = Object.entries(schema.channels);
  const channelUnion = entries.map(([k]) => `"${k}"`).join(" | ");
  const argBlocks = entries
    .map(([k, v]) => {
      const args = v.args || {};
      const fields = Object.entries(args)
        .map(([n, t]) => {
          const { out, opt } = tsType(t as string);
          return `    ${n}${opt ? "?" : ""}: ${out};`;
        })
        .join("\n");
      return `  "${k}": {\n${fields}\n  };`;
    })
    .join("\n");

  const ts = `/* AUTO-GENERATED ??DO NOT EDIT */
export type IpcVersion = "${schema.ipcVersion}";
export type Channel = ${channelUnion};

export interface ArgsMap {
${argBlocks}
}

export const Channels = {
${entries.map(([k]) => `  ${k.replace(/\./g, "_")}: "${k}"`).join(",\n")}
} as const;

export type Envelope<C extends Channel = Channel> = {
  version: IpcVersion;
  reqId?: string;
  channel: C;
  args: ArgsMap[C];
};
`;
  const outPath = path.resolve("src/core/ipc/channels.gen.ts");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, ts);
  console.log("[IPC] Wrote", outPath);
}

function genCPP() {
  const keys = Object.keys(schema.channels);
  const header = `// AUTO-GENERATED ??DO NOT EDIT
#pragma once
#include <string_view>

namespace ipc {
static constexpr std::string_view kIpcVersion = "${schema.ipcVersion}";
${keys
  .map(
    (k) =>
      `static constexpr std::string_view ${k.replace(/\./g, "_")} = "${k}";`
  )
  .join("\n")}
static constexpr std::string_view kAllChannels[] = { ${keys
    .map((k) => `"${k}"`)
    .join(", ")} };
} // namespace ipc
`;
  const outPath = path.resolve("native/ipc/channels.gen.h");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header);
  console.log("[IPC] Wrote", outPath);
}

genTS();
genCPP();
console.log("[IPC] codegen done.");