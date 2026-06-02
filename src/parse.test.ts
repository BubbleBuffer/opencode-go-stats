import { describe, it, expect } from "vitest";
import { parseRefs, parseRecordObj } from "./parse";

describe("parseRefs", () => {
  it("parses null refs", () => {
    const text = "$R[0]=null)";
    const refs = parseRefs(text);
    expect(refs[0]).toBeNull();
  });

  it("parses integer refs", () => {
    const text = "$R[5]=42)";
    const refs = parseRefs(text);
    expect(refs[5]).toBe(42);
  });

  it("parses float refs", () => {
    const text = "$R[1]=3.14)";
    const refs = parseRefs(text);
    expect(refs[1]).toBeCloseTo(3.14);
  });

  it("parses negative float refs", () => {
    const text = "$R[2]=-0.5)";
    const refs = parseRefs(text);
    expect(refs[2]).toBeCloseTo(-0.5);
  });

  it("parses string refs", () => {
    const text = '$R[3]="hello world")';
    const refs = parseRefs(text);
    expect(refs[3]).toBe("hello world");
  });

  it("parses multiple refs", () => {
    const text = '$R[0]=null)\n$R[1]=100)\n$R[2]="test")\n$R[3]=1.5)';
    const refs = parseRefs(text);
    expect(refs[0]).toBeNull();
    expect(refs[1]).toBe(100);
    expect(refs[2]).toBe("test");
    expect(refs[3]).toBeCloseTo(1.5);
  });
});

describe("parseRecordObj", () => {
  it("parses null field", () => {
    const refs: Record<number, string | number | null> = {};
    const obj = parseRecordObj("id:null)", refs);
    expect(obj.id).toBeNull();
  });

  it("parses integer field", () => {
    const refs: Record<number, string | number | null> = {};
    const obj = parseRecordObj("inputTokens:1000)", refs);
    expect(obj.inputTokens).toBe(1000);
  });

  it("parses float field", () => {
    const refs: Record<number, string | number | null> = {};
    const obj = parseRecordObj("cost:3.14)", refs);
    expect(obj.cost).toBeCloseTo(3.14);
  });

  it("parses negative float field", () => {
    const refs: Record<number, string | number | null> = {};
    const obj = parseRecordObj("cost:-0.5)", refs);
    expect(obj.cost).toBeCloseTo(-0.5);
  });

  it("parses string field", () => {
    const refs: Record<number, string | number | null> = {};
    const obj = parseRecordObj('model:"gpt-4")', refs);
    expect(obj.model).toBe("gpt-4");
  });

  it("resolves ref values", () => {
    const refs: Record<number, string | number | null> = { 0: 500, 1: "claude-3" };
    const obj = parseRecordObj("outputTokens:$R[0],model:$R[1])", refs);
    expect(obj.outputTokens).toBe(500);
    expect(obj.model).toBe("claude-3");
  });

  it("parses multiple fields", () => {
    const refs: Record<number, string | number | null> = {};
    const obj = parseRecordObj('id:null,inputTokens:500,outputTokens:300,model:"test-model")', refs);
    expect(obj.id).toBeNull();
    expect(obj.inputTokens).toBe(500);
    expect(obj.outputTokens).toBe(300);
    expect(obj.model).toBe("test-model");
  });
});