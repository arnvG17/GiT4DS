import React, { useEffect, useState } from "react";
import axios from "axios";

const BACKEND = import.meta.env.VITE_BACKEND || "https://localhost:5000";

export default function UserDashboard() {
  const [userData, setUserData] = useState(null);
  const [ghRepos, setGhRepos] = useState([]);
  const teamName = localStorage.getItem("teamName");

  // load user + repos
  useEffect(() => {
    if (!teamName) return;

    axios.post(`${BACKEND}/user/data`, { teamName })
    .then((res) => {
      setUserData(res.data);

      // if repos is already included in user data, just set it
      if (Array.isArray(res.data.repos)) {
        setGhRepos(res.data.repos);  // or setRepos depending on what you want
      }

      // you can still optionally call other APIs here if needed
    })
    .catch(() => setUserData(null));
}, [teamName]);

  // save/update repo
  const onSubmit = async (e) => {
    e.preventDefault();
    const repoUrl = e.target.repoUrl.value;
    const description = e.target.description.value;

    try {
      const r = await axios.post(`${BACKEND}/user/submit`, {
        teamName,
        repoUrl,
        description,
      });
      // update local state
      setUserData({
        ...userData,
        repos: [...(userData?.repos || []), r.data.repo],
      });
      alert("Saved");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save repo");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>User Dashboard</h2>

      <form onSubmit={onSubmit}>
        <div>
          <label>Select Repo</label>
          <select name="repoUrl" required>
            <option value="">-- pick a repo --</option>
            {ghRepos.map((r) => (
              <option key={r.name} value={r.html_url}>
                {r.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Description</label>
          <input name="description" />
        </div>
        <button type="submit">Submit / Update</button>
      </form>

      <h3>Saved</h3>
      <ul>
        {(userData?.repos || []).map((r, i) => (
          <li key={i}>
            <a href={r.repoUrl} target="_blank" rel="noreferrer">
              {r.repoUrl}
            </a>
            <div>{r.description}</div>
            <div>Latest: {r.latestCommitSha || "—"}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
