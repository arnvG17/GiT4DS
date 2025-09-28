// src/components/AdminDashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";

const BACKEND_URL = process.env.REACT_APP_BACKEND || "https://git4ds.onrender.com";

const formatTime = (ts) => {
  if (!ts) return "N/A";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleString();
};

function ShortSha({ sha }) {
  if (!sha) return "—";
  return <span className="font-mono">{sha.slice(0, 7)}</span>;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState({
    firstCommitRankings: [],
    latestCommitRankings: [],
    recentActivity: [],
    totalCommits: []
  });
  const [isConnected, setIsConnected] = useState(false);
  const [showLatestFirst, setShowLatestFirst] = useState(true);
  const [expandedRowKey, setExpandedRowKey] = useState(null);

  const socketRef = useRef(null);
  const teamNamea = localStorage.getItem("teamName");

  // load static users (selected repos)
  useEffect(() => {
    axios.get(`${BACKEND_URL}/admin/selected-repos`, {
      headers: { Authorization: `Bearer ${teamNamea}` }
    }).then(res => {
      const fetchedUsers = res.data.users || [];
      setUsers(fetchedUsers);
    }).catch(err => {
      console.warn("Failed to fetch selected repos:", err);
      setUsers([]);
    });
  }, [teamNamea]);

  // preload leaderboard snapshot (first & latest included)
  useEffect(() => {
    axios.get(`${BACKEND_URL}/admin/leaderboard`)
      .then(res => {
        setLeaderboardData(prev => ({ ...prev, ...res.data }));
      })
      .catch(err => {
        console.warn("Could not preload leaderboard snapshot:", err);
      });
  }, []);

  // socket setup
  useEffect(() => {
    const socket = io(BACKEND_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Socket connected");
    });
    socket.on("disconnect", () => {
      setIsConnected(false);
      console.log("Socket disconnected");
    });
    socket.on("leaderboard:update", (data) => {
      // incoming snapshot — merge in
      setLeaderboardData(prev => ({ ...prev, ...data }));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("leaderboard:update");
        socketRef.current.disconnect();
      }
    };
  }, []);

  const currentRankings = showLatestFirst
    ? (leaderboardData.latestCommitRankings || [])
    : (leaderboardData.firstCommitRankings || []);

  const getTotalCommitsFor = (userId, teamName) => {
    const t = (leaderboardData.totalCommits || []).find(x => ('' + x.userId) === ('' + userId) || x.teamName === teamName);
    return t ? t.count : 0;
  };

  // recentActivity is global; filter by teamName/userId for per-team history
  const getRecentCommitsFor = (teamName, userId) => {
    const all = leaderboardData.recentActivity || [];
    return all.filter(c =>
      (c.teamName && c.teamName === teamName) ||
      (c.username && c.username === teamName) ||
      (c.userId && ('' + c.userId) === ('' + userId))
    );
  };

  const toggleExpand = (key) => setExpandedRowKey(prev => (prev === key ? null : key));

  const copyToClipboard = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      // optionally show toast
    } catch (e) {
      console.warn("copy failed", e);
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <header className="mb-8 border-b pb-4">
        <h1 className="text-4xl font-extrabold text-indigo-700">Admin Leaderboard Dashboard</h1>
        <p className={`text-sm font-medium mt-1 ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
          Status: {isConnected ? 'LIVE (Real-time tracking active)' : 'Disconnected / not receiving updates'}
        </p>
      </header>

      <section className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-800">🏆 Leaderboard</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm">Show latest commits top</label>
            <input type="checkbox" checked={showLatestFirst} onChange={() => setShowLatestFirst(s => !s)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-indigo-200">
            <thead className="bg-indigo-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-indigo-600 uppercase">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-indigo-600 uppercase">Team</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-indigo-600 uppercase">{showLatestFirst ? 'Latest Commit' : 'First Commit'}</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-indigo-600 uppercase">Details</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {currentRankings.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-gray-500">No ranking data yet</td>
                </tr>
              ) : (
                currentRankings.map((u, idx) => {
                  const key = u.userId || u.teamName || idx;
                  const commitObj = showLatestFirst ? u.latestCommit : u.firstCommit;
                  const ts = commitObj?.timestamp;
                  const recentForTeam = getRecentCommitsFor(u.teamName, u.userId);
                  const total = getTotalCommitsFor(u.userId, u.teamName);
                  const latest = recentForTeam[0] || null;

                  return (
                    <React.Fragment key={key}>
                      <tr className={(idx < 3 && ts) ? 'bg-yellow-50 font-bold' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ts ? idx + 1 : '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{u.teamName || u.username || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {commitObj ? (
                            <div className="flex flex-col">
                              <div className="font-mono text-sm"><ShortSha sha={commitObj.sha} /></div>
                              <div className="text-xs">{formatTime(commitObj.timestamp)}</div>
                            </div>
                          ) : 'No commit'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="inline-flex items-center gap-2 px-3 py-1 rounded-md border hover:bg-indigo-50" onClick={() => toggleExpand(key)}>
                            <svg className={`w-4 h-4 transform ${expandedRowKey === key ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className="text-sm">Info</span>
                          </button>
                        </td>
                      </tr>

                      {expandedRowKey === key && (
                        <tr>
                          <td colSpan="4" className="px-6 py-4 bg-gray-50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h3 className="text-sm font-semibold">Team / User</h3>
                                <p className="text-sm">{u.teamName || u.username || '—'}</p>

                                <div className="mt-3">
                                  <h4 className="text-sm font-semibold">Total commits</h4>
                                  <p className="text-sm">{total}</p>
                                </div>

                                <div className="mt-3">
                                  <h4 className="text-sm font-semibold">First commit</h4>
                                  {u.firstCommit ? (
                                    <>
                                      <div className="text-xs font-mono">{u.firstCommit.sha.slice(0,7)}</div>
                                      <div className="text-xs">{formatTime(u.firstCommit.timestamp)}</div>
                                      <div className="text-sm truncate max-w-md">{u.firstCommit.message || '(no message)'}</div>
                                      <div className="mt-2 flex gap-2">
                                        <a href={u.firstCommit.repoFullName ? `https://github.com/${u.firstCommit.repoFullName}/commit/${u.firstCommit.sha}` : '#'} target="_blank" rel="noreferrer" className="text-xs underline">View</a>
                                        <button className="text-xs px-2 py-1 border rounded" onClick={() => copyToClipboard(u.firstCommit.sha)}>Copy SHA</button>
                                      </div>
                                    </>
                                  ) : <p className="text-sm text-gray-500">No first commit</p>}
                                </div>

                                <div className="mt-3">
                                  <h4 className="text-sm font-semibold">Latest commit</h4>
                                  {u.latestCommit ? (
                                    <>
                                      <div className="text-xs font-mono">{u.latestCommit.sha.slice(0,7)}</div>
                                      <div className="text-xs">{formatTime(u.latestCommit.timestamp)}</div>
                                      <div className="text-sm truncate max-w-md">{u.latestCommit.message || '(no message)'}</div>
                                      <div className="mt-2 flex gap-2">
                                        <a href={u.latestCommit.repoFullName ? `https://github.com/${u.latestCommit.repoFullName}/commit/${u.latestCommit.sha}` : '#'} target="_blank" rel="noreferrer" className="text-xs underline">View</a>
                                        <button className="text-xs px-2 py-1 border rounded" onClick={() => copyToClipboard(u.latestCommit.sha)}>Copy SHA</button>
                                      </div>
                                    </>
                                  ) : <p className="text-sm text-gray-500">No latest commit</p>}
                                </div>
                              </div>

                              <div>
                                <h4 className="text-sm font-semibold">Recent commits (up to 5)</h4>
                                <div className="mt-2 space-y-2">
                                  {recentForTeam.length === 0 ? (
                                    <p className="text-sm text-gray-500">No recent commits</p>
                                  ) : (
                                    recentForTeam.slice(0, 5).map((c, i) => (
                                      <div key={`${c.sha}-${i}`} className="p-2 bg-white rounded border">
                                        <div className="flex justify-between">
                                          <div>
                                            <div className="text-xs font-mono">{c.sha ? c.sha.slice(0,7) : '—'}</div>
                                            <div className="text-xs">{formatTime(c.timestamp)}</div>
                                          </div>
                                          <div className="text-sm text-right">
                                            <div className="truncate max-w-xs">{c.message || '(no message)'}</div>
                                            <div className="text-xs text-gray-500">{c.repo}</div>
                                          </div>
                                        </div>
                                        <div className="mt-2 flex gap-2">
                                          <a href={c.repo ? `https://github.com/${c.repo}/commit/${c.sha}` : '#'} target="_blank" rel="noreferrer" className="text-xs underline">View</a>
                                          <button className="text-xs px-2 py-1 border rounded" onClick={() => copyToClipboard(c.sha)}>Copy SHA</button>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* global recent commits table */}
      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">📋 Recent Commits (global)</h2>
        <div className="overflow-x-auto bg-white p-6 rounded-xl shadow-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SHA</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Repo</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {(leaderboardData.recentActivity || []).length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">No recent commits</td>
                </tr>
              ) : (
                (leaderboardData.recentActivity || []).map(c => (
                  <tr key={c.sha || `${c.teamName}-${c.timestamp}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTime(c.timestamp)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{c.teamName || c.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{c.message}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600"><ShortSha sha={c.sha} /></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.repo}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
