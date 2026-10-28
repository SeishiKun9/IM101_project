import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("UI Error caught by ErrorBoundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="error-boundary-card">
          <div className="error-boundary-icon">⚠️</div>
          <h3 className="error-boundary-title">
            {this.props.title || "Something went wrong in this section"}
          </h3>
          <p className="error-boundary-message">
            {this.state.error?.message || "An unexpected rendering error occurred."}
          </p>
          <div className="error-boundary-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={this.handleReset}
            >
              Try Again
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

