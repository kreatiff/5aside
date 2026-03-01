import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const MfaPage = () => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { verifyMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get token injected from the login success stage
  const mfaToken = location.state?.mfaToken;

  useEffect(() => {
    if (!mfaToken) {
      navigate("/login", { replace: true });
    }
  }, [mfaToken, navigate]);

  if (!mfaToken) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await verifyMfa({ mfaToken, code });

      if (result.success) {
        navigate("/dashboard");
      } else {
        setError(result.error || "Invalid MFA code");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-icon" style={{ margin: "0 auto 16px" }}>
            5
          </div>
          <h1>Two-Factor Auth</h1>
          <p>Please enter the code from your authenticator app.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="code">
              Authenticator Code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              className="input-field"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="000000"
              style={{
                fontSize: "1.5rem",
                letterSpacing: "0.2em",
                textAlign: "center",
                padding: "1rem",
              }}
              required
              autoFocus
            />
          </div>

          {error && (
            <p
              className="error-text"
              style={{ marginBottom: "16px", textAlign: "center" }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginBottom: "12px" }}
            disabled={loading || code.length < 6}
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>

          <button
            type="button"
            className="btn btn-outline"
            style={{ width: "100%" }}
            onClick={() => navigate("/login")}
          >
            Back to Login
          </button>
        </form>
      </div>
    </div>
  );
};
