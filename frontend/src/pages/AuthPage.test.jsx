/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthPage } from "./AuthPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    authFailureReason: "Your session expired or became invalid. Please sign in again.",
    clearAuthFailureReason: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
  }),
}));

describe("AuthPage session expiry messaging", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a clean re-auth prompt after an expired session redirect", () => {
    render(
      <MemoryRouter initialEntries={["/auth?reason=expired&next=%2F"]}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Your session expired or became invalid. Please sign in again."),
    ).toBeTruthy();
  });
});
