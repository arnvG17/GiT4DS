import React, { useEffect, useState } from "react";
import axios from "axios";

const BACKEND = import.meta.env.VITE_BACKEND || "https://localhost:5000";

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const teamNamea = localStorage.getItem("teamName");
  console.log("ibadbfadhbg", teamNamea)

  useEffect(() => {
    axios
      .get(`${BACKEND}/admin/selected-repos`, {
        headers: { Authorization: `Bearer ${teamNamea }` }, // optional
      })
      .then((res) => {
        setUsers(res.data.users || []);
      })
      .catch((err) => {
        console.error(err);
        setUsers([]);
      });
  }, []);

  return (
    <div>
      <h2>Admin Dashboard</h2>
      <table border={1} cellPadding={6} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Team</th>
            <th>Selected Repo</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u._id}>
              <td>{u.teamName}</td>
              <td>
                {u.selectedRepo ? (
                  <a href={u.selectedRepo} target="_blank" rel="noreferrer">
                    {u.selectedRepo}
                  </a>
                ) : (
                  "No repo selected"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
