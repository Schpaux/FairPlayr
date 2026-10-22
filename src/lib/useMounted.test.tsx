import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { useMounted } from "./useMounted";

afterEach(cleanup);

function Probe() {
  return <span data-testid="probe">{useMounted() ? "mounted" : "server"}</span>;
}

describe("useMounted", () => {
  it("is false when rendered on the server", () => {
    expect(renderToString(<Probe />)).toContain("server");
  });

  it("is true once rendered in the browser", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("mounted");
  });
});
