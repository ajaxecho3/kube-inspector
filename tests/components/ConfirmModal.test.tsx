import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { ConfirmModal } from "../../src/components/ConfirmModal";

describe("ConfirmModal", () => {
  it("renders the action description", () => {
    const { lastFrame } = render(
      <ConfirmModal
        title="Confirm Deletion"
        description='Delete pod "bad-pod" in namespace "staging"?'
        isProduction={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(lastFrame()).toContain("bad-pod");
    expect(lastFrame()).toContain("staging");
  });

  it("renders production warning when isProduction is true", () => {
    const { lastFrame } = render(
      <ConfirmModal
        title="Confirm Deletion"
        description="Delete something"
        isProduction={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(lastFrame()).toContain("PRODUCTION");
  });

  it("does NOT call onConfirm on render", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        title="Confirm"
        description="Do something"
        isProduction={false}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
