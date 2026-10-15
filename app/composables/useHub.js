const SESSION_KEY = "gathered-hub-session";
const LOCAL_KEY = "gathered-hub-db";

function emptyState() {
  return { events: [], people: [], items: [], updates: [], invites: [], profiles: [] };
}

function uid() {
  if (import.meta.client && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function eachDay(start, end) {
  const days = [];
  if (!start || !end) return days;
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last && days.length < 62) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function formatDay(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

let boot;

export function useHub() {
  const config = useRuntimeConfig();
  const state = useState("gh-state", emptyState);
  const session = useState("gh-session", () => null);
  const ready = useState("gh-ready", () => false);
  const mode = useState("gh-mode", () => "local");
  const error = useState("gh-error", () => "");
  const services = useState("gh-services", () => null);

  function readLocal() {
    try {
      return { ...emptyState(), ...JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") };
    } catch {
      return emptyState();
    }
  }

  function writeLocal() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state.value));
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function writeSession(next) {
    session.value = next;
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  }

  function logChange(eventId, summary) {
    const entry = {
      id: uid(),
      eventId,
      summary,
      actor: session.value?.name || "Someone",
      createdAt: Date.now(),
    };
    state.value.updates.unshift(entry);
    if (mode.value !== "firebase") writeLocal();
    return entry;
  }

  async function ensureSignedIn() {
    if (mode.value !== "firebase" || !services.value) return;
    if (services.value.auth.currentUser) return;
    const { signInAnonymously } = await import("firebase/auth");
    await signInAnonymously(services.value.auth);
  }

  async function put(collectionName, record) {
    const list = state.value[collectionName];
    const index = list.findIndex((item) => item.id === record.id);
    if (index === -1) list.push(record);
    else list[index] = record;
    if (mode.value === "firebase" && services.value) {
      await ensureSignedIn();
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(services.value.db, collectionName, record.id), record);
    } else {
      writeLocal();
    }
  }

  async function remove(collectionName, id) {
    state.value[collectionName] = state.value[collectionName].filter((item) => item.id !== id);
    if (mode.value === "firebase" && services.value) {
      await ensureSignedIn();
      const { doc, deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(services.value.db, collectionName, id));
    } else {
      writeLocal();
    }
  }

  async function init() {
    if (!import.meta.client) return;
    session.value = readSession();
    const pub = config.public;
    if (pub.firebaseApiKey && pub.firebaseProjectId) {
      await initFirebase(pub);
    } else {
      mode.value = "local";
      state.value = readLocal();
      ready.value = true;
    }
  }

  async function initFirebase(pub) {
    const { initializeApp } = await import("firebase/app");
    const { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged } =
      await import("firebase/auth");
    const { getFirestore, collection, onSnapshot } = await import("firebase/firestore");
    const { getStorage } = await import("firebase/storage");
    const app = initializeApp({
      apiKey: pub.firebaseApiKey,
      authDomain: pub.firebaseAuthDomain,
      projectId: pub.firebaseProjectId,
      storageBucket: pub.firebaseStorageBucket,
      messagingSenderId: pub.firebaseMessagingSenderId,
      appId: pub.firebaseAppId,
      measurementId: pub.firebaseMeasurementId,
    });
    if (pub.firebaseMeasurementId) {
      const { getAnalytics, isSupported } = await import("firebase/analytics");
      if (await isSupported()) getAnalytics(app);
    }
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    const db = getFirestore(app);
    const storage = getStorage(app);
    services.value = { auth, db, storage };
    mode.value = "firebase";
    let listening = false;
    function listen() {
      if (listening) return;
      listening = true;
      for (const name of ["events", "people", "items", "updates", "invites", "profiles"]) {
        onSnapshot(
          collection(db, name),
          (snap) => {
            state.value[name] = snap.docs.map((entry) => entry.data());
            if (name === "updates") {
              state.value.updates.sort((a, b) => b.createdAt - a.createdAt);
            }
            ready.value = true;
          },
          (cause) => {
            error.value = cause.message || "Could not read the hub from Firebase.";
            ready.value = true;
          },
        );
      }
    }
    onAuthStateChanged(auth, async (user) => {
      if (user?.email) {
        const profile = await loadProfile(user).catch(() => null);
        const current = readSession();
        const admin = configuredAdmin();
        const signedInEmail = user.email.toLowerCase();
        if (profile) {
          writeSession(admin && profile.email === admin ? { ...profile, kind: "superadmin" } : profile);
        } else if (!current || current.email.toLowerCase() !== signedInEmail) {
          writeSession({
            name: current?.name || signedInEmail.split("@")[0],
            email: signedInEmail,
            kind: admin && signedInEmail === admin ? "superadmin" : (current?.kind || "guest"),
          });
        } else if (admin && signedInEmail === admin && current.kind === "superadmin") {
          writeSession({ ...current, kind: "superadmin", email: signedInEmail });
        }
      }
      if (user) listen();
      else ready.value = true;
    });
  }

  async function loadProfile(user) {
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(services.value.db, "profiles", user.uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      name: data.name,
      email: String(data.email || user.email || "").toLowerCase(),
      kind: data.kind || "guest",
      phone: data.phone || "",
    };
  }

  async function saveProfile(profile) {
    writeSession(profile);
    const user = services.value?.auth?.currentUser;
    if (mode.value !== "firebase" || !user) return;
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(services.value.db, "profiles", user.uid), {
      id: user.uid,
      uid: user.uid,
      name: profile.name,
      email: profile.email,
      kind: profile.kind,
      phone: profile.phone || "",
    });
  }

  async function ensureGuestAccount(email, password) {
    if (mode.value !== "firebase" || !services.value) return;
    const current = services.value.auth.currentUser;
    if (current?.email && current.email.toLowerCase() === email) return;
    const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import("firebase/auth");
    try {
      await createUserWithEmailAndPassword(services.value.auth, email, password);
    } catch (cause) {
      if (cause?.code !== "auth/email-already-in-use") {
        if (cause?.code === "auth/weak-password") {
          throw new Error("Use a password with at least 6 characters.");
        }
        throw new Error(cause?.message || "Could not create the account.");
      }
      try {
        await signInWithEmailAndPassword(services.value.auth, email, password);
      } catch {
        throw new Error("This email already has an account. Use the password you chose before.");
      }
    }
  }

  async function signIn(email, password) {
    if (mode.value !== "firebase" || !services.value) {
      throw new Error("Sign-in needs the shared hub.");
    }
    const clean = email.trim().toLowerCase();
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    let cred;
    try {
      cred = await signInWithEmailAndPassword(services.value.auth, clean, password);
    } catch {
      throw new Error("That email and password did not match an account.");
    }
    const profile = await loadProfile(cred.user);
    if (profile) writeSession(profile);
    else writeSession({ name: clean.split("@")[0], email: clean, kind: "guest" });
  }

  function ensure() {
    if (!import.meta.client) return Promise.resolve();
    if (!boot) boot = init().catch((cause) => {
      error.value = cause.message || "Could not open the hub.";
      mode.value = "local";
      state.value = readLocal();
      ready.value = true;
    });
    return boot;
  }

  function myEvents() {
    if (!session.value) return [];
    const email = session.value.email.toLowerCase();
    const ids = new Set(
      state.value.people
        .filter((person) => person.email.toLowerCase() === email)
        .map((person) => person.eventId),
    );
    return state.value.events
      .filter((event) => ids.has(event.id) || event.organizerEmail.toLowerCase() === email)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function eventById(id) {
    return state.value.events.find((event) => event.id === id) || null;
  }

  function peopleFor(eventId) {
    return state.value.people
      .filter((person) => person.eventId === eventId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function itemsFor(eventId) {
    return state.value.items
      .filter((item) => item.eventId === eventId)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }

  function updatesFor(eventId) {
    return state.value.updates.filter((entry) => entry.eventId === eventId);
  }

  function configuredAdmin() {
    return String(config.public.superadminEmail || "").trim().toLowerCase();
  }

  function isSuperadmin() {
    const email = configuredAdmin();
    return !!email
      && session.value?.kind === "superadmin"
      && session.value.email?.toLowerCase() === email;
  }

  function isOrganizer(event) {
    if (!event) return false;
    if (isSuperadmin()) return true;
    return session.value?.email?.toLowerCase() === event.organizerEmail.toLowerCase();
  }

  function allEvents() {
    return [...state.value.events].sort((a, b) => a.start.localeCompare(b.start));
  }

  function allUsers() {
    const byEmail = new Map();
    for (const person of state.value.people) {
      const email = String(person.email || "").toLowerCase();
      if (!email) continue;
      const current = byEmail.get(email) || { email, name: person.name || "", phone: person.phone || "", events: [] };
      if (person.name) current.name = person.name;
      if (person.phone) current.phone = person.phone;
      const event = eventById(person.eventId);
      if (event && !current.events.some((item) => item.id === event.id)) {
        current.events.push({ id: event.id, name: event.name });
      }
      byEmail.set(email, current);
    }
    for (const profile of state.value.profiles || []) {
      const email = String(profile.email || "").toLowerCase();
      if (!email) continue;
      const current = byEmail.get(email) || { email, name: profile.name || "", phone: profile.phone || "", events: [] };
      if (!current.name && profile.name) current.name = profile.name;
      if (!current.phone && profile.phone) current.phone = profile.phone;
      byEmail.set(email, current);
    }
    return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function saveUser(email, input) {
    if (!isSuperadmin()) throw new Error("Only the superadmin can edit users.");
    const clean = email.trim().toLowerCase();
    const name = input.name.trim();
    const phone = String(input.phone || "").trim();
    if (!name) throw new Error("A user needs a name.");
    for (const person of state.value.people.filter((item) => item.email.toLowerCase() === clean)) {
      await put("people", { ...person, name, phone });
    }
    for (const profile of (state.value.profiles || []).filter((item) => String(item.email || "").toLowerCase() === clean)) {
      await put("profiles", { ...profile, name, phone });
    }
  }

  async function signInSuperadmin(email, password) {
    const expected = configuredAdmin();
    const clean = email.trim().toLowerCase();
    if (!expected || clean !== expected) {
      throw new Error("That email is not the superadmin.");
    }
    if (mode.value !== "firebase" || !services.value) {
      throw new Error("Superadmin sign-in needs the shared hub.");
    }
    const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import("firebase/auth");
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(services.value.auth, clean, password);
    } catch (cause) {
      if (cause?.code === "auth/weak-password") {
        throw new Error("Use a password with at least 6 characters.");
      }
      if (cause?.code !== "auth/email-already-in-use") {
        throw new Error(cause?.message || "Could not sign in as superadmin.");
      }
      try {
        cred = await signInWithEmailAndPassword(services.value.auth, clean, password);
      } catch {
        throw new Error("That password does not match the superadmin account.");
      }
    }
    const existing = await loadProfile(cred.user);
    await saveProfile({
      name: existing?.name && existing.name !== clean.split("@")[0] ? existing.name : "Superadmin",
      email: clean,
      kind: "superadmin",
      phone: existing?.phone || "",
    });
  }

  async function logout() {
    writeSession(null);
    if (mode.value === "firebase" && services.value?.auth?.currentUser) {
      const { signOut } = await import("firebase/auth");
      await signOut(services.value.auth);
    }
    if (import.meta.client) await navigateTo("/");
  }

  async function enterAsOrganizer(name, email) {
    writeSession({ name: name.trim(), email: email.trim().toLowerCase(), kind: "organizer" });
    if (mode.value === "firebase") await ensureSignedIn();
  }

  async function createEvent(input) {
    const event = {
      id: uid(),
      name: input.name.trim(),
      place: input.place.trim(),
      start: input.start,
      end: input.end,
      notes: input.notes.trim(),
      coverUrl: "",
      organizerEmail: session.value.email,
      organizerName: session.value.name,
      createdAt: Date.now(),
    };
    state.value.events.push(event);
    const person = {
      id: uid(),
      eventId: event.id,
      name: session.value.name,
      email: session.value.email,
      status: "coming",
      arrival: event.start,
      departure: event.end,
      lodging: "",
    };
    state.value.people.push(person);
    const entry = logChange(event.id, `${session.value.name} opened ${event.name}.`);
    if (mode.value === "local") writeLocal();
    else {
      try {
        await put("events", event);
        await put("people", person);
        await put("updates", entry);
      } catch (cause) {
        state.value.events = state.value.events.filter((item) => item.id !== event.id);
        state.value.people = state.value.people.filter((item) => item.id !== person.id);
        state.value.updates = state.value.updates.filter((item) => item.id !== entry.id);
        throw cause;
      }
    }
    return event;
  }

  async function savePerson(person, summary) {
    await put("people", { ...person });
    if (summary) {
      const entry = logChange(person.eventId, summary);
      if (mode.value === "firebase") await put("updates", entry);
    }
  }

  async function saveItem(item, summary) {
    await put("items", { ...item });
    if (summary) {
      const entry = logChange(item.eventId, summary);
      if (mode.value === "firebase") await put("updates", entry);
    }
  }

  async function deleteItem(item) {
    const entry = logChange(item.eventId, `${session.value.name} removed “${item.title}” from the calendar.`);
    await remove("items", item.id);
    if (mode.value === "firebase") await put("updates", entry);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function queueInviteEmail(message) {
    return new Promise(async (resolve, reject) => {
      try {
        await ensureSignedIn();
        const { collection, addDoc, onSnapshot } = await import("firebase/firestore");
        const ref = await addDoc(collection(services.value.db, "emails"), {
          ...message,
          createdBy: services.value.auth.currentUser.uid,
        });
        const timer = setTimeout(() => {
          stop();
          resolve("queued");
        }, 20000);
        const stop = onSnapshot(
          ref,
          (snap) => {
            const data = snap.data() || {};
            if (data.status === "sent" || data.sent === true) {
              clearTimeout(timer);
              stop();
              resolve(true);
            } else if (data.status === "failed") {
              clearTimeout(timer);
              stop();
              reject(new Error(data.error || "Could not send the invitation email. The invite link still works."));
            }
          },
          (cause) => {
            clearTimeout(timer);
            reject(cause);
          },
        );
      } catch (cause) {
        reject(cause);
      }
    });
  }

  async function invite(event, email) {
    const clean = email.trim().toLowerCase();
    const existing = state.value.invites.find(
      (item) => item.eventId === event.id && item.email === clean,
    );
    const invite = existing || {
      id: uid(),
      eventId: event.id,
      email: clean,
      token: uid(),
      createdAt: Date.now(),
    };
    await put("invites", invite);
    const entry = logChange(event.id, `${session.value.name} invited ${clean}.`);
    if (mode.value === "firebase") await put("updates", entry);
    const inviteUrl = `${location.origin}/join/${invite.token}`;
    localStorage.setItem("gathered-hub-email", clean);
    const who = session.value?.name || "Someone";
    const subject = `You're invited to ${event.name}`;
    const text = `${who} invited you to ${event.name}.\n\nOpen the gathering:\n${inviteUrl}\n`;
    const html = `<p>${escapeHtml(who)} invited you to <strong>${escapeHtml(event.name)}</strong>.</p><p><a href="${escapeHtml(inviteUrl)}">Open the gathering</a></p>`;
    let emailed = false;
    let mailError = "";
    try {
      if (mode.value === "firebase" && services.value) {
        emailed = await queueInviteEmail({
          to: clean,
          subject,
          text,
          html,
          inviteId: invite.id,
        });
      } else {
        await $fetch("/api/invite", {
          method: "POST",
          body: {
            email: clean,
            eventName: event.name,
            inviteUrl,
            hostName: who,
          },
        });
        emailed = true;
      }
    } catch (cause) {
      mailError = cause?.data?.message
        || cause?.statusMessage
        || cause?.message
        || "Could not send the invitation email. The invite link still works.";
    }
    return { record: invite, emailed, mailError };
  }

  async function acceptInvite(token, name, phone, password) {
    const invite = state.value.invites.find((item) => item.token === token);
    if (!invite) return null;
    const event = eventById(invite.eventId);
    if (!event) return null;
    const cleanName = name.trim();
    const cleanPhone = String(phone || "").trim();
    if (mode.value === "firebase") {
      await ensureGuestAccount(invite.email, password);
    }
    await saveProfile({ name: cleanName, email: invite.email, kind: "guest", phone: cleanPhone });
    let person = state.value.people.find(
      (item) => item.eventId === event.id && item.email === invite.email,
    );
    if (!person) {
      person = {
        id: uid(),
        eventId: event.id,
        name: cleanName,
        email: invite.email,
        phone: cleanPhone,
        status: "coming",
        arrival: event.start,
        departure: event.end,
        lodging: "",
      };
      await put("people", person);
      const entry = logChange(event.id, `${person.name} joined ${event.name}.`);
      if (mode.value === "firebase") await put("updates", entry);
    } else if (person.name !== cleanName || person.phone !== cleanPhone) {
      person.name = cleanName;
      person.phone = cleanPhone;
      await put("people", person);
    }
    return event;
  }

  async function saveCover(event, file) {
    let coverUrl = "";
    if (mode.value === "firebase" && services.value) {
      await ensureSignedIn();
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const stored = ref(services.value.storage, `events/${event.id}/cover-${uid()}`);
      await uploadBytes(stored, file);
      coverUrl = await getDownloadURL(stored);
    } else {
      coverUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
    await put("events", { ...event, coverUrl });
    const entry = logChange(event.id, `${session.value.name} updated the gathering photo.`);
    if (mode.value === "firebase") await put("updates", entry);
  }

  return {
    state,
    session,
    ready,
    mode,
    error,
    ensure,
    myEvents,
    eventById,
    peopleFor,
    itemsFor,
    updatesFor,
    isOrganizer,
    isSuperadmin,
    allEvents,
    allUsers,
    saveUser,
    logout,
    enterAsOrganizer,
    signIn,
    signInSuperadmin,
    createEvent,
    savePerson,
    saveItem,
    deleteItem,
    invite,
    acceptInvite,
    saveCover,
    eachDay,
    formatDay,
    uid,
  };
}
