import { useEffect, useState, useCallback } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function App() {
  const [emails, setEmails] = useState([]);
  const [tab, setTab] = useState("scheduled");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info"); // info, success, error

  // User auth state
  const [user, setUser] = useState({
    name: "ReachInbox User",
    email: "hk4pbt5z4big3whu@ethereal.email",
    avatar: "R",
  });
  const [googleOAuthConfigured, setGoogleOAuthConfigured] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchSource, setSearchSource] = useState("");

  // Compose form state
  const [fromEmail, setFromEmail] = useState("hk4pbt5z4big3whu@ethereal.email");
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [delay, setDelay] = useState(0);
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [recipients, setRecipients] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch emails from backend
  const getEmails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/emails/`);
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setEmails(data);
    } catch (error) {
      console.error("Error fetching emails:", error);
      setMessage("Could not load emails from server.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Check auth & query params on mount
  useEffect(() => {
    getEmails();

    // Check OAuth return params
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
      const email = params.get("email");
      const name = params.get("name") || email?.split("@")[0] || "User";
      if (email) {
        setUser({
          name,
          email,
          avatar: name.charAt(0).toUpperCase(),
        });
        setFromEmail(email);
        setMessage(`Logged in successfully as ${name} (${email})`);
        setMessageType("success");
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check auth status from backend
    fetch(`${API_BASE}/api/auth/me`)
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.email) {
          setUser({
            name: data.user.name || "ReachInbox User",
            email: data.user.email,
            avatar: (data.user.name || data.user.email || "R").charAt(0).toUpperCase(),
          });
          setFromEmail(data.user.email);
        }
        setGoogleOAuthConfigured(Boolean(data.googleOAuthConfigured));
      })
      .catch((err) => console.warn("Auth check error:", err));
  }, [getEmails]);

  // Search emails API
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      getEmails();
      setSearchSource("");
      return;
    }

    try {
      setIsSearching(true);
      const response = await fetch(
        `${API_BASE}/api/emails/search?q=${encodeURIComponent(searchQuery.trim())}`
      );
      const data = await response.json();
      setEmails(data.results || []);
      setSearchSource(data.source || "database");
      setTab("all");
    } catch (error) {
      setMessage("Search failed.");
      setMessageType("error");
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchSource("");
    getEmails();
  };

  // CSV parsing
  function handleCsv(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
      const text = reader.result;
      const list = text
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter((item) => item.includes("@"));

      const uniqueList = [...new Set(list)];
      setRecipients(uniqueList);

      if (uniqueList.length > 0) {
        setToEmail(uniqueList[0]);
        setMessage(`✅ ${uniqueList.length} unique recipient(s) loaded from CSV.`);
        setMessageType("success");
      } else {
        setMessage("No valid email addresses found in CSV.");
        setMessageType("error");
      }
    };
    reader.readAsText(file);
  }

  // Schedule email submit
  async function scheduleEmail(event) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/api/emails/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromEmail: fromEmail,
          toEmail: toEmail,
          subject: subject,
          body: body,
          scheduledAt: scheduledAt,
          delay: Number(delay),
          hourlyLimit: Number(hourlyLimit),
          recipients: recipients,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Failed to schedule email.");
        setMessageType("error");
        return;
      }

      setMessage(
        `🎉 Successfully scheduled ${data.recipientCount || 1} email(s)! Jobs queued in BullMQ.`
      );
      setMessageType("success");

      setToEmail("");
      setSubject("");
      setBody("");
      setScheduledAt("");
      setRecipients([]);

      getEmails();
    } catch (error) {
      setMessage("Network error. Failed to schedule email.");
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  // Cancel / Delete an email
  async function handleCancelEmail(id) {
    if (!window.confirm("Are you sure you want to cancel and remove this scheduled email?")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/emails/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message || "Scheduled email cancelled and removed.");
        setMessageType("info");
        getEmails();
      } else {
        setMessage(data.message || "Failed to cancel email.");
        setMessageType("error");
      }
    } catch (err) {
      setMessage("Network error while cancelling email.");
      setMessageType("error");
    }
  }

  // Google OAuth button click
  function handleGoogleLogin() {
    if (!googleOAuthConfigured) {
      alert(
        "Google OAuth is ready on the backend, but GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET have not been added to backend/.env yet."
      );
      return;
    }
    window.location.href = `${API_BASE}/api/auth/google`;
  }

  function handleLogout() {
    setUser({
      name: "ReachInbox User",
      email: "hk4pbt5z4big3whu@ethereal.email",
      avatar: "R",
    });
    setFromEmail("hk4pbt5z4big3whu@ethereal.email");
    setMessage("Logged out.");
    setMessageType("info");
  }

  const scheduledEmails = emails.filter((email) => email.status === "SCHEDULED");
  const sentEmails = emails.filter((email) => email.status === "SENT");
  const failedEmails = emails.filter((email) => email.status === "FAILED");

  const visibleEmails =
    tab === "scheduled"
      ? scheduledEmails
      : tab === "sent"
      ? sentEmails
      : tab === "failed"
      ? failedEmails
      : emails;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="brand-logo">📬</div>
          <div>
            <h1>ReachInbox</h1>
            <p>Smart Email Scheduling & Queue Dashboard</p>
          </div>
        </div>

        <div className="header-actions">
          {/* BullMQ Dashboard External Link */}
          <a
            href={`${API_BASE}/admin/queues`}
            target="_blank"
            rel="noopener noreferrer"
            className="bull-board-link"
            title="Open BullMQ queue management board"
          >
            📊 BullMQ Dashboard
          </a>

          <div className="user-section">
            <div className="avatar">{user.avatar}</div>

            <div className="user-info">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="google-auth-button"
              title="Sign in with Google"
            >
              Google Login
            </button>

            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="dashboard">
        {/* Banner Message */}
        {message && (
          <div className={`message-banner ${messageType}`}>
            <span>{message}</span>
            <button
              className="close-msg-btn"
              onClick={() => setMessage("")}
            >
              ✕
            </button>
          </div>
        )}

        {/* Compose / Schedule Email Form */}
        <section className="compose-card">
          <div className="card-header">
            <h2>✉️ Compose & Schedule Emails</h2>
            <span className="badge-tech">BullMQ + PostgreSQL + Ethereal</span>
          </div>

          <p className="subtitle">
            Configure staggered scheduling, hourly rate limits, and CSV batch recipient delivery.
          </p>

          <form onSubmit={scheduleEmail}>
            <div className="form-row">
              <div className="form-group">
                <label>From Email (Sender)</label>
                <input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>To Email (Single Recipient)</label>
                <input
                  type="email"
                  placeholder="recipient@example.com"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  required={recipients.length === 0}
                />
              </div>
            </div>

            {/* CSV Recipient Upload */}
            <div className="form-group csv-section">
              <label>CSV Batch Recipients (Optional)</label>
              <div className="file-input-wrapper">
                <input
                  type="file"
                  id="csv-file-input"
                  accept=".csv"
                  onChange={handleCsv}
                />
                <label htmlFor="csv-file-input" className="file-input-label">
                  📁 Choose CSV File
                </label>
                {recipients.length > 0 && (
                  <span className="recipient-pill">
                    🎯 <strong>{recipients.length}</strong> recipient(s) ready
                  </span>
                )}
              </div>
              <small className="help-text">
                Upload a CSV file containing email addresses for batch sending.
              </small>
            </div>

            {/* Subject */}
            <div className="form-group">
              <label>Subject Line</label>
              <input
                type="text"
                placeholder="Exciting update from ReachInbox..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            {/* Body */}
            <div className="form-group">
              <label>Email Body</label>
              <textarea
                placeholder="Write your email content here..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>

            {/* Schedule & Timing Options */}
            <div className="form-row">
              <div className="form-group">
                <label>Schedule Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Delay Between Emails (seconds)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 5"
                  value={delay}
                  onChange={(e) => setDelay(e.target.value)}
                />
                <small className="help-text">Staggers batch deliveries.</small>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Hourly Sending Limit (per sender)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="100"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(e.target.value)}
                />
                <small className="help-text">
                  Excess emails are automatically rescheduled for next hour.
                </small>
              </div>

              <div className="form-group button-group">
                <label>&nbsp;</label>
                <button
                  type="submit"
                  className="schedule-button"
                  disabled={submitting}
                >
                  {submitting ? "Queuing Jobs..." : "🚀 Schedule Email"}
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Email Search & Status Section */}
        <section className="emails-card">
          <div className="emails-card-header">
            <div>
              <h2>📋 Email Status & History</h2>
              <p className="subtitle">
                Track queued delayed jobs, sent confirmations, and search across history.
              </p>
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="search-form">
              <input
                type="text"
                placeholder="🔍 Search recipient, subject, sender..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="search-btn" disabled={isSearching}>
                {isSearching ? "..." : "Search"}
              </button>
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={handleClearSearch}
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {searchSource && (
            <div className="search-source-tag">
              Source: <strong>{searchSource.toUpperCase()}</strong> search results ({emails.length})
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="tabs">
            <button
              className={tab === "scheduled" ? "active" : ""}
              onClick={() => setTab("scheduled")}
            >
              Scheduled <span>{scheduledEmails.length}</span>
            </button>

            <button
              className={tab === "sent" ? "active" : ""}
              onClick={() => setTab("sent")}
            >
              Sent <span>{sentEmails.length}</span>
            </button>

            {failedEmails.length > 0 && (
              <button
                className={tab === "failed" ? "active failed-tab" : "failed-tab"}
                onClick={() => setTab("failed")}
              >
                Failed <span>{failedEmails.length}</span>
              </button>
            )}

            <button
              className={tab === "all" ? "active" : ""}
              onClick={() => setTab("all")}
            >
              All Emails <span>{emails.length}</span>
            </button>

            <button
              className="refresh-btn"
              onClick={getEmails}
              title="Refresh emails"
            >
              🔄 Refresh
            </button>
          </div>

          {/* Emails Content */}
          {loading ? (
            <div className="empty-state">
              <div className="spinner"></div>
              <p>Loading email queue...</p>
            </div>
          ) : visibleEmails.length === 0 ? (
            <div className="empty-state">
              <h3>No {tab} emails found</h3>
              <p>Schedule a new email above or adjust your search filter.</p>
            </div>
          ) : (
            <div className="email-list">
              {visibleEmails.map((email) => (
                <div className="email-item" key={email.id}>
                  <div className="email-main">
                    <div className="email-header-line">
                      <h3>{email.subject}</h3>
                      <span className={`status ${email.status.toLowerCase()}`}>
                        {email.status}
                      </span>
                    </div>

                    <p className="email-meta">
                      <strong>From:</strong> {email.fromEmail} &nbsp;|&nbsp;{" "}
                      <strong>To:</strong> {email.toEmail}
                    </p>

                    <p className="email-body">{email.body}</p>
                  </div>

                  <div className="email-info">
                    <span className="time-badge">
                      📅 <strong>Scheduled:</strong>{" "}
                      {new Date(email.scheduleAt).toLocaleString()}
                    </span>

                    {email.sentAt && (
                      <span className="time-badge sent">
                        ✅ <strong>Sent:</strong>{" "}
                        {new Date(email.sentAt).toLocaleString()}
                      </span>
                    )}

                    {email.status === "SCHEDULED" && (
                      <button
                        onClick={() => handleCancelEmail(email.id)}
                        className="cancel-button"
                        title="Cancel this scheduled email"
                      >
                        Cancel / Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;