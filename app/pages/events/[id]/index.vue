<template>
  <main class="shell">
    <header class="top">
      <NuxtLink class="brand" to="/"><strong>GatheredHub</strong></NuxtLink>
      <p v-if="session" class="muted">{{ session.name }}</p>
    </header>
    <p v-if="!ready">Opening the gathering…</p>
    <section v-else-if="!event">
      <h1>That gathering is not on this hub.</h1>
      <NuxtLink to="/">Back home</NuxtLink>
    </section>
    <section v-else>
      <img v-if="event.coverUrl" class="cover" :src="event.coverUrl" alt="" />
      <p class="kicker">{{ formatDay(event.start) }} – {{ formatDay(event.end) }}</p>
      <h1>{{ event.name }}</h1>
      <p>{{ event.place }}</p>
      <p v-if="event.notes">{{ event.notes }}</p>
      <label v-if="organizer" class="muted">
        Gathering photo
        <input type="file" accept="image/*" @change="onCover" />
      </label>

      <div class="tabs" role="tablist">
        <button type="button" :aria-selected="tab === 'people'" @click="tab = 'people'">Who’s coming</button>
        <button type="button" :aria-selected="tab === 'calendar'" @click="tab = 'calendar'">Calendar</button>
        <button type="button" :aria-selected="tab === 'updates'" @click="tab = 'updates'">Updates</button>
        <button v-if="organizer" type="button" :aria-selected="tab === 'invite'" @click="tab = 'invite'">Invite</button>
      </div>

      <div v-if="tab === 'people'" class="list">
        <label class="search">
          Search
          <input v-model="peopleQuery" type="search" autocomplete="off" placeholder="Name, coming, or where they’re staying" />
        </label>
        <p v-if="peopleQuery.trim() && !visiblePeople.length" class="muted">No one matches that search.</p>
        <div class="row people-sort">
          <span class="grow"></span>
          <span class="grow sort-label">
            Arrive
            <span class="sort-arrows">
              <button type="button" aria-label="Sort by arrive, earliest first" :aria-pressed="peopleSort.field === 'arrival' && peopleSort.dir === 'asc'" @click="setPeopleSort('arrival', 'asc')">↑</button>
              <button type="button" aria-label="Sort by arrive, latest first" :aria-pressed="peopleSort.field === 'arrival' && peopleSort.dir === 'desc'" @click="setPeopleSort('arrival', 'desc')">↓</button>
            </span>
          </span>
          <span class="grow sort-label">
            Leave
            <span class="sort-arrows">
              <button type="button" aria-label="Sort by leave, earliest first" :aria-pressed="peopleSort.field === 'departure' && peopleSort.dir === 'asc'" @click="setPeopleSort('departure', 'asc')">↑</button>
              <button type="button" aria-label="Sort by leave, latest first" :aria-pressed="peopleSort.field === 'departure' && peopleSort.dir === 'desc'" @click="setPeopleSort('departure', 'desc')">↓</button>
            </span>
          </span>
        </div>
        <article v-for="person in visiblePeople" :key="person.id" class="card person">
          <form class="form" @submit.prevent="saveStay(person)">
            <div class="when">
              <strong>{{ person.name }}</strong>
              <div class="contact">
                <a :href="`mailto:${person.email}`">{{ person.email }}</a>
                <a v-if="person.phone" :href="telHref(person.phone)">{{ person.phone }}</a>
              </div>
            </div>
            <div class="row">
              <label class="grow">Coming?
                <select :value="person.status" :disabled="!canEdit(person)" @change="onStatus(person, $event)">
                  <option value="coming">Coming</option>
                  <option value="maybe">Maybe</option>
                  <option value="out">Can’t</option>
                </select>
              </label>
              <label class="grow">Arrive <input v-model="person.arrival" type="date" :min="event.start" :max="event.end" :disabled="!canEdit(person)" @input="markStayDirty(person)" /></label>
              <label class="grow">Leave <input v-model="person.departure" type="date" :min="event.start" :max="event.end" :disabled="!canEdit(person)" @input="markStayDirty(person)" /></label>
            </div>
            <label>Where they’re staying <input v-model="person.lodging" :disabled="!canEdit(person)" placeholder="Blue cottage, inn, or a friend’s house" @input="markStayDirty(person)" /></label>
            <button
              v-if="canEdit(person)"
              class="btn"
              :class="{ saved: staySaved(person), saving: staySaving(person) }"
              type="submit"
              :disabled="staySaving(person)"
              :aria-label="staySaving(person) ? 'Saving' : undefined"
            >
              <span v-if="staySaving(person)" class="spinner" aria-hidden="true"></span>
              <template v-else>{{ staySaved(person) ? "Updated" : "Save" }}</template>
            </button>
          </form>
        </article>
      </div>

      <div v-else-if="tab === 'calendar'" class="days">
        <article v-for="day in days" :key="day" class="card day">
          <h2>{{ formatDay(day) }}</h2>
          <div v-for="item in itemsOn(day)" :key="item.id" class="plan">
            <div class="when">
              <strong>{{ item.time }} {{ item.title }}</strong>
              <button class="btn secondary" type="button" @click="deleteItem(item)">Remove</button>
            </div>
            <p class="muted">{{ item.place }}</p>
          </div>
          <form class="form" autocomplete="off" @submit.prevent="addItem(day)">
            <div class="row">
              <label class="grow">Plan <input v-model="drafts[day].title" required placeholder="e.g. porch dinner" autocomplete="off" :name="`plan-${day}`" /></label>
              <label>Time <input v-model="drafts[day].time" type="time" required autocomplete="off" :name="`time-${day}`" /></label>
            </div>
            <label>Where <input v-model="drafts[day].place" placeholder="The house" autocomplete="off" :name="`where-${day}`" /></label>
            <button class="btn" type="submit">Add to this day</button>
          </form>
        </article>
      </div>

      <div v-else-if="tab === 'updates'" class="list">
        <p v-if="!updates.length" class="muted">No changes yet.</p>
        <article v-for="entry in updates" :key="entry.id" class="card update">
          <strong>{{ entry.summary }}</strong>
          <p class="muted">{{ entry.actor }} · {{ when(entry.createdAt) }}</p>
        </article>
      </div>

      <form v-else class="card form" style="padding: 18px" @submit.prevent="sendInvite">
        <h2>Invite by email</h2>
        <label>Email <input v-model="inviteEmail" type="email" required placeholder="guest@example.com" /></label>
        <button class="btn terra" type="submit" :disabled="sendingInvite">
          {{ sendingInvite ? "Sending…" : "Send invite" }}
        </button>
        <p v-if="inviteStatus" :class="inviteFailed ? 'error' : 'muted'">{{ inviteStatus }}</p>
        <p v-if="inviteLink"><a :href="inviteLink">{{ inviteLink }}</a></p>
      </form>
    </section>
  </main>
</template>

<script setup>
const route = useRoute();
const hub = useHub();
const {
  ready, session, eventById, peopleFor, itemsFor, updatesFor, isOrganizer,
  savePerson, saveItem, deleteItem, invite, saveCover, eachDay, formatDay, uid,
} = hub;

const tab = ref("people");
const inviteEmail = ref("");
const inviteLink = ref("");
const inviteStatus = ref("");
const inviteFailed = ref(false);
const sendingInvite = ref(false);
const drafts = reactive({});
const savedStays = reactive({});
const savingStays = reactive({});
const peopleQuery = ref("");
const peopleSort = ref({ field: "", dir: "asc" });
const statusLabel = { coming: "Coming", maybe: "Maybe", out: "Can’t" };

const event = computed(() => eventById(route.params.id));
const people = computed(() => (event.value ? peopleFor(event.value.id) : []));
const visiblePeople = computed(() => {
  const query = peopleQuery.value.trim().toLowerCase();
  const matched = query
    ? people.value.filter((person) => {
        const status = `${person.status || ""} ${statusLabel[person.status] || ""}`.toLowerCase();
        return [person.name, status, person.lodging]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
    : people.value;
  const { field, dir } = peopleSort.value;
  if (!field) return matched;
  return [...matched].sort((a, b) => {
    const left = a[field] || "";
    const right = b[field] || "";
    if (!left && !right) return a.name.localeCompare(b.name);
    if (!left) return 1;
    if (!right) return -1;
    const compared = left.localeCompare(right);
    if (compared === 0) return a.name.localeCompare(b.name);
    return dir === "asc" ? compared : -compared;
  });
});
const updates = computed(() => (event.value ? updatesFor(event.value.id) : []));
const organizer = computed(() => isOrganizer(event.value));
const days = computed(() => (event.value ? eachDay(event.value.start, event.value.end) : []));
watch(days, (list) => {
  for (const day of list) {
    if (!drafts[day]) drafts[day] = { title: "", time: "16:00", place: "" };
  }
}, { immediate: true });

function telHref(phone) {
  return `tel:${String(phone).replace(/[^\d+]/g, "")}`;
}

function setPeopleSort(field, dir) {
  peopleSort.value = { field, dir };
}

function canEdit(person) {
  if (!session.value) return false;
  return organizer.value || person.email === session.value.email;
}

function itemsOn(day) {
  if (!event.value) return [];
  return itemsFor(event.value.id).filter((item) => item.date === day);
}

function when(stamp) {
  return new Date(stamp).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function staySaved(person) {
  return savedStays[person.id] === true;
}

function staySaving(person) {
  return savingStays[person.id] === true;
}

function markStayDirty(person) {
  savedStays[person.id] = false;
}

function onStatus(person, event) {
  person.status = event.target.value;
  markStayDirty(person);
}

async function saveStay(person) {
  if (savingStays[person.id]) return;
  savingStays[person.id] = true;
  try {
    await savePerson(person, `${person.name} updated arrival, departure, or where they are staying.`);
    savedStays[person.id] = true;
  } finally {
    savingStays[person.id] = false;
  }
}

async function addItem(day) {
  const draft = drafts[day];
  await saveItem(
    {
      id: uid(),
      eventId: event.value.id,
      date: day,
      title: draft.title.trim(),
      time: draft.time,
      place: draft.place.trim(),
    },
    `${session.value.name} added ${draft.title.trim()} on ${formatDay(day)}.`,
  );
  draft.title = "";
  draft.place = "";
}

async function sendInvite() {
  sendingInvite.value = true;
  inviteStatus.value = "";
  inviteFailed.value = false;
  try {
    const result = await invite(event.value, inviteEmail.value);
    inviteLink.value = `${location.origin}/join/${result.record.token}`;
    inviteFailed.value = result.emailed === false;
    inviteStatus.value = result.emailed === true
      ? `Invitation sent to ${inviteEmail.value}.`
      : result.emailed === "queued"
        ? "Invite saved. The email is queued and will send once the mail function confirms it."
        : result.mailError;
  } catch (cause) {
    inviteFailed.value = true;
    inviteStatus.value = cause.message || "Could not create the invite.";
  } finally {
    sendingInvite.value = false;
  }
}

async function onCover(change) {
  const file = change.target.files?.[0];
  if (file) await saveCover(event.value, file);
}
</script>
