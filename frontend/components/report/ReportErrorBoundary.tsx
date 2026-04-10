"use client";

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Label shown in the fallback (e.g. "GitHub Intelligence") */
  section?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * ErrorBoundary that wraps individual report sections.
 * If a section crashes (bad data, undefined access, etc.), only that
 * section shows a graceful fallback — the rest of the report stays intact.
 *
 * PDF Guide item: "Add React ErrorBoundary to each report section"
 */
export default class ReportErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ReportErrorBoundary] ${this.props.section || "Section"} crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="rounded-2xl border border-amber-500/20 p-5"
          style={{ background: "rgba(251,191,36,0.04)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-400 text-lg">⚠️</span>
            <h3 className="text-sm font-bold text-amber-400">
              {this.props.section || "Section"} — Display Error
            </h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            This section encountered a rendering error and was isolated to prevent the report from breaking.
            The rest of your report is unaffected.
          </p>
          <p className="text-[10px] text-slate-600 mt-2 font-mono">
            {this.state.error?.message || "Unknown error"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-3 text-[11px] font-bold text-amber-400 hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
