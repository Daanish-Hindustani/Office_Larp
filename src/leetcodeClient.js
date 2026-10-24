import { useEffect, useRef, useState } from "react";
import { rankProfiles } from "./leetcodeProblems";

export async function leetcodeRequest(path, signal) {
  const response = await fetch(`/api/leetcode/${path}`, { signal });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The LeetCode connection isn’t available. Run the app with npm run dev or npm start.",
    );
  }
  if (!response.ok)
    throw new Error(
      body.error || "LeetCode couldn’t be reached. Try again shortly.",
    );
  return body;
}
function readBoard() {
  try {
    const data = JSON.parse(
      localStorage.getItem("office-hours:leetcode:profiles") || "[]",
    );
    return Array.isArray(data)
      ? data
          .filter(
            (item) =>
              /^[\w-]{1,40}$/.test(item.username) &&
              [item.easy, item.medium, item.hard, item.total].every(
                (number) => Number.isFinite(number) && number >= 0,
              ),
          )
          .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
export function useLeetCodeRoom(visible) {
  const [catalog, setCatalog] = useState(null),
    [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [profiles, setProfiles] = useState(readBoard),
    [profileErrors, setProfileErrors] = useState({});
  const [profileError, setProfileError] = useState(""),
    [syncing, setSyncing] = useState(false),
    [adding, setAdding] = useState(false);
  const [selectedUser, setSelectedUser] = useState(
    () => readBoard()[0]?.username || "",
  );
  const [storageAvailable, setStorageAvailable] = useState(true);
  const profileRef = useRef(profiles);
  profileRef.current = profiles;
  const mounted = useRef(true),
    loadController = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loadController.current?.abort();
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "office-hours:leetcode:profiles",
        JSON.stringify(profiles),
      );
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, [profiles]);
  useEffect(() => {
    const update = (event) => {
      if (event.key === "office-hours:leetcode:profiles")
        setProfiles(readBoard());
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  async function loadCatalog() {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const data = await leetcodeRequest("catalog", controller.signal);
      if (mounted.current) setCatalog(data);
    } catch (error) {
      if (!controller.signal.aborted && mounted.current)
        setCatalogError(error.message);
    } finally {
      if (!controller.signal.aborted && mounted.current)
        setCatalogLoading(false);
    }
  }
  async function refreshProfiles() {
    if (!profileRef.current.length) return;
    setSyncing(true);
    setProfileError("");
    const tracked = [...profileRef.current];
    const results = await Promise.allSettled(
      tracked.map((profile) =>
        leetcodeRequest(
          `profiles/${encodeURIComponent(profile.username)}?refresh=1`,
        ),
      ),
    );
    if (!mounted.current) return;
    const updates = new Map(),
      errors = {};
    results.forEach((result, index) => {
      const username = tracked[index]?.username;
      if (result.status === "fulfilled")
        updates.set(result.value.username.toLowerCase(), result.value);
      else if (username) errors[username.toLowerCase()] = result.reason.message;
    });
    setProfiles((list) =>
      list.map(
        (profile) => updates.get(profile.username.toLowerCase()) || profile,
      ),
    );
    setProfileErrors(errors);
    setSyncing(false);
  }
  useEffect(() => {
    if (visible) {
      if (!catalog) loadCatalog();
      refreshProfiles();
    }
  }, [visible]);
  async function addProfile(value) {
    const username = value.trim().replace(/^@/, "");
    setProfileError("");
    if (!/^[\w-]{1,40}$/.test(username)) {
      setProfileError(
        "Enter a LeetCode username using letters, numbers, underscores, or hyphens.",
      );
      return false;
    }
    if (
      profileRef.current.some(
        (profile) => profile.username.toLowerCase() === username.toLowerCase(),
      )
    ) {
      setSelectedUser(
        profileRef.current.find(
          (profile) =>
            profile.username.toLowerCase() === username.toLowerCase(),
        ).username,
      );
      return true;
    }
    if (profileRef.current.length >= 8) {
      setProfileError(
        "This studio board has room for eight profiles. Remove one before adding another.",
      );
      return false;
    }
    setAdding(true);
    try {
      const profile = await leetcodeRequest(
        `profiles/${encodeURIComponent(username)}`,
      );
      if (!mounted.current) return false;
      setProfiles((list) =>
        list.some(
          (entry) =>
            entry.username.toLowerCase() === profile.username.toLowerCase(),
        )
          ? list
          : [...list, profile].slice(0, 8),
      );
      setSelectedUser(profile.username);
      return true;
    } catch (error) {
      if (mounted.current) setProfileError(error.message);
      return false;
    } finally {
      if (mounted.current) setAdding(false);
    }
  }
  async function verify(username) {
    const profile = await leetcodeRequest(
      `profiles/${encodeURIComponent(username)}?refresh=1`,
    );
    setProfiles((list) =>
      list.map((item) =>
        item.username.toLowerCase() === profile.username.toLowerCase()
          ? profile
          : item,
      ),
    );
    setProfileErrors((errors) => ({
      ...errors,
      [profile.username.toLowerCase()]: "",
    }));
    return profile;
  }
  function removeProfile(username) {
    setProfiles((list) =>
      list.filter((profile) => profile.username !== username),
    );
    if (selectedUser === username)
      setSelectedUser(
        profileRef.current.find((profile) => profile.username !== username)
          ?.username || "",
      );
  }
  return {
    catalog,
    catalogError,
    catalogLoading,
    loadCatalog,
    profiles: rankProfiles(profiles),
    profileError,
    profileErrors,
    syncing,
    adding,
    addProfile,
    refreshProfiles,
    removeProfile,
    selectedUser,
    setSelectedUser,
    storageAvailable,
    verify,
  };
}

// Rebuild the statement from a small HTML allowlist. Upstream HTML never gets
// scripts, styles, event handlers, or arbitrary URL schemes inside the app.
export function sanitizeProblemHTML(html) {
  const source = new DOMParser().parseFromString(html, "text/html");
  const target = document.createElement("div");
  const allowed = new Set([
    "P",
    "PRE",
    "CODE",
    "STRONG",
    "B",
    "EM",
    "I",
    "UL",
    "OL",
    "LI",
    "BR",
    "SUP",
    "SUB",
    "SPAN",
    "DIV",
    "TABLE",
    "THEAD",
    "TBODY",
    "TR",
    "TH",
    "TD",
    "A",
  ]);
  const discard = new Set([
    "SCRIPT",
    "STYLE",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "FORM",
    "INPUT",
    "BUTTON",
    "SVG",
    "MATH",
    "LINK",
    "META",
  ]);
  function copy(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || discard.has(node.tagName))
      return;
    if (!allowed.has(node.tagName)) {
      [...node.childNodes].forEach((child) => copy(child, parent));
      return;
    }
    const element = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === "A") {
      try {
        const url = new URL(node.getAttribute("href"), "https://leetcode.com/");
        if (url.protocol === "https:") {
          element.href = url.href;
          element.target = "_blank";
          element.rel = "noopener noreferrer";
        }
      } catch {}
    }
    [...node.childNodes].forEach((child) => copy(child, element));
    parent.appendChild(element);
  }
  [...source.body.childNodes].forEach((node) => copy(node, target));
  return target.innerHTML;
}
