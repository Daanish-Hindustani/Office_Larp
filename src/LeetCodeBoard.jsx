import { useState } from "react";
import { Avatar } from "./Office";

export default function LeetCodeBoard({ room }) {
  const [username, setUsername] = useState("");
  return (
    <section className="leetcode-board" aria-labelledby="leetcode-board-title">
      <div className="lab-section-heading">
        <h2 id="leetcode-board-title">Studio leaderboard</h2>
        <button
          onClick={room.refreshProfiles}
          disabled={room.syncing || !room.profiles.length}
        >
          {room.syncing ? "Syncing…" : "↻ Refresh"}
        </button>
      </div>
      <p className="lab-fine-print">
        All-time public solves · Easy 1 / Medium 3 / Hard 5 points
      </p>
      {!room.profiles.length && (
        <div className="lab-empty-board">
          <span aria-hidden="true">◇</span>
          <strong>A little friendly momentum.</strong>
          <p>Add a LeetCode username to start the studio board.</p>
        </div>
      )}
      <ol className="leetcode-ranks">
        {room.profiles.map((profile, index) => (
          <li
            key={profile.username}
            className={
              room.selectedUser === profile.username ? "is-tracked" : ""
            }
          >
            <span className="leetcode-place">
              {profile.place.toString().padStart(2, "0")}
            </span>
            <Avatar sprite={index % 5} />
            <div className="leetcode-rank-info">
              <a
                href={`https://leetcode.com/u/${encodeURIComponent(profile.username)}/`}
                target="_blank"
                rel="noreferrer"
              >
                {profile.username} ↗
              </a>
              <span>
                <b className="difficulty-easy">{profile.easy} E</b>
                <b className="difficulty-medium">{profile.medium} M</b>
                <b className="difficulty-hard">{profile.hard} H</b>
              </span>
              <small>
                {room.profileErrors[profile.username.toLowerCase()]
                  ? "Sync failed · showing last snapshot"
                  : `Synced ${new Date(profile.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </small>
            </div>
            <div className="leetcode-rank-score">
              <strong>{profile.points.toLocaleString()}</strong>
              <small>{profile.total.toLocaleString()} solved</small>
            </div>
            <button
              className="leetcode-remove-profile"
              aria-label={`Remove ${profile.username} from leaderboard`}
              onClick={() => room.removeProfile(profile.username)}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <form
        className="leetcode-profile-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await room.addProfile(username)) setUsername("");
        }}
      >
        <label htmlFor="leetcode-username">Track a LeetCode username</label>
        <div>
          <input
            id="leetcode-username"
            autoComplete="off"
            maxLength={40}
            placeholder="Your username or a friend’s"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <button disabled={room.adding || !username.trim()}>
            {room.adding ? "…" : "+ Add"}
          </button>
        </div>
      </form>
      {room.profileError && (
        <p className="lab-notice" role="alert">
          {room.profileError}
        </p>
      )}
      {Object.values(room.profileErrors).some(Boolean) && (
        <p className="lab-fine-print" role="status">
          Some profiles couldn’t refresh. Your saved standings are still here;
          try again shortly.
        </p>
      )}
      {room.profiles.length > 0 && (
        <label className="leetcode-profile-picker">
          Use for Accepted checks
          <select
            aria-label="Profile for Accepted checks"
            value={
              room.profiles.some(
                (profile) => profile.username === room.selectedUser,
              )
                ? room.selectedUser
                : ""
            }
            onChange={(event) => room.setSelectedUser(event.target.value)}
          >
            <option value="">Choose a tracked profile</option>
            {room.profiles.map((profile) => (
              <option key={profile.username} value={profile.username}>
                {profile.username}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="lab-fine-print">
        Public profiles, tracked in this browser. Practice tests don’t add
        leaderboard points.
        {!room.storageAvailable &&
          " Browser storage is unavailable; this board lasts until you reload."}
      </p>
    </section>
  );
}
