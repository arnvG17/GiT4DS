import React, { useState } from "react";

export default function RepoList() {
  const [repos] = useState([
    { name: "team-repo", latestCommit: "Initial commit" },
    { name: "hackathon-project", latestCommit: "Added feature X" },
  ]);

  return (
    <div>
      <h3>Your Repos</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Repo Name</th>
            <th>Latest Commit</th>
          </tr>
        </thead>
        <tbody>
          {repos.map((repo, idx) => (
            <tr key={idx}>
              <td>{repo.name}</td>
              <td>{repo.latestCommit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
