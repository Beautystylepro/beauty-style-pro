import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "@/hooks/useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset CSS variables
    document.documentElement.style.cssText = "";
  });

  it("defaults to dark theme when localStorage is empty", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("restores light theme from localStorage", () => {
    localStorage.setItem("style-theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("toggles from dark to light", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    act(() => { result.current.toggleTheme(); });
    expect(result.current.theme).toBe("light");
  });

  it("toggles from light to dark", () => {
    localStorage.setItem("style-theme", "light");
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.toggleTheme(); });
    expect(result.current.theme).toBe("dark");
  });

  it("persists theme choice to localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme("light"); });
    expect(localStorage.getItem("style-theme")).toBe("light");
  });

  it("applies CSS variables for light theme", () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme("light"); });
    const bg = document.documentElement.style.getPropertyValue("--background");
    expect(bg).toBeTruthy();
    expect(bg).toContain("93%");
  });

  it("applies CSS variables for dark theme", () => {
    localStorage.setItem("style-theme", "light");
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme("dark"); });
    const bg = document.documentElement.style.getPropertyValue("--background");
    expect(bg).toBeTruthy();
    expect(bg).toContain("2%");
  });
});
