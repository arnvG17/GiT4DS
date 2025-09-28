import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";

const BACKEND_URL = process.env.REACT_APP_BACKEND || "https://git4ds.onrender.com";

const formatTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState({
    firstCommitRankings: [],
    latestCommitRankings: [],
    recentActivity: [],
    totalCommits: []
  });
  const [isConnected, setIsConnected] = useState(false);

  // toggle: show earliest-first (first commit wins) or latest-first (most recent wins)
  const [showLatestFirst, setShowLatestFirst] = useState(true);

  const socketRef = useRef(null);
  const teamNamea = localStorage.getItem("teamName");

  // load static users (same as your original)
  useEffect(() => {
    axios.get(`${BACKEND_URL}/admin/selected-repos`, {
      headers: { Authorization: `Bearer ${teamNamea}` }
    })
      .then(res => {
        const fetchedUsers = res.data.users || [];
        setUsers(fetchedUsers);

        const initialRankings = fetchedUsers
          .filter(user => user.selectedRepo)
          .map(user => ({
            teamName: user.teamName,
            firstCommitTimestamp: null
          }));

        setLeaderboardData(prev => ({ ...prev, firstCommitRankings: initialRankings }));
      })
      .catch(err => {
        console.error("Error fetching static admin data:", err);
        setUsers([]);
      });
  }, [teamNamea]);

  // preload leaderboard snapshot from server so UI is not empty until a socket event
  useEffect(() => {
    axios.get(`${BACKEND_URL}/admin/leaderboard`)
      .then(res => {
        // set the full snapshot
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

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('🔌 Socket.IO Connected for real-time updates.');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('❌ Socket.IO Disconnected.');
    });

    socket.on('leaderboard:update', (data) => {
      // data is the computed snapshot from server
      console.log('✅ Real-time Leaderboard Update Received.');
      // don't rely on leaderboardData variable here (it may be stale) — just apply the incoming data
      setLeaderboardData(prev => ({
        ...prev,
        ...data
      }));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off('leaderboard:update');
        socketRef.current.disconnect();
      }
    };
  }, []);

  // pick ranking list based on toggle
  const currentRankings = showLatestFirst
    ? (leaderboardData.latestCommitRankings || [])
    : (leaderboardData.firstCommitRankings || []);

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <header className="mb-8 border-b pb-4">
        <h1 className="text-4xl font-extrabold text-indigo-700">Admin Leaderboard Dashboard</h1>
        <p className={`text-sm font-medium mt-1 ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
          Status: {isConnected ? 'LIVE (Real-time tracking active)' : 'Disconnected. Check server.'}
        </p>
      </header>

      <section className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-800">🏆 Real-Time Ranking</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm">Show latest commits top</label>
            <input
              type="checkbox"
              checked={showLatestFirst}
              onChange={() => setShowLatestFirst(v => !v)}
            />
          </div>
        </div>

        {/* debug: remove in prod */}
        {/* <pre className="text-xs bg-gray-100 p-2 rounded">{JSON.stringify(leaderboardData, null, 2)}</pre> */}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-indigo-200">
            <thead className="bg-indigo-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-indigo-600 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-indigo-600 uppercase tracking-wider">Team</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-indigo-600 uppercase tracking-wider">
                  {showLatestFirst ? 'Latest Commit Time (Newest)' : 'First Commit Time (Earliest)'}
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {currentRankings.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-6 py-4 text-center text-gray-500">Waiting for teams or data...</td>
                </tr>
              ) : (
                currentRankings.map((u, idx) => {
                  const ts = showLatestFirst ? u.latestCommitTimestamp : u.firstCommitTimestamp;
                  return (
                    <tr key={u.userId || u.teamName || idx} className={(idx < 3 && ts) ? 'bg-yellow-50 font-bold' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ts ? idx + 1 : '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{u.teamName || u.username || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatTime(ts)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* RECENT COMMITS TABLE (all commits) */}
      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">📋 Recent Commits (most recent first)</h2>
        <div className="overflow-x-auto bg-white p-6 rounded-xl shadow-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SHA</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Repo</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {(leaderboardData.recentActivity || []).length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">No recent commits yet</td>
                </tr>
              ) : (
                (leaderboardData.recentActivity || []).map((c) => (
                  <tr key={c.sha || `${c.teamName}-${c.timestamp}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTime(c.timestamp)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{c.teamName || c.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{c.message}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">{c.sha?.slice(0, 7) || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.repo}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* STATIC ADMIN DATA SECTION */}
      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">📁 All Submitted Repositories</h2>
        <div className="overflow-x-auto bg-white p-6 rounded-xl shadow-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Selected Repo</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((u) => (
                <tr key={u._id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{u.teamName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                    {u.selectedRepo ? (
                      <a href={u.selectedRepo} target="_blank" rel="noreferrer" className="hover:underline">{u.selectedRepo}</a>
                    ) : (<span className="text-gray-500">No repo selected</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
