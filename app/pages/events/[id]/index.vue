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
        <article v-for="person in people" :key="person.id" class="card person">
          <form class="form" @submit.prevent="saveStay(person)">
            <div class="when">
              <strong>{{ person.name }}</strong>
              <span class="muted">{{ person.email }}</span>
            </div>
            <div class="row">
              <label class="grow">Coming?
                <select v-model="person.status" :disabled="!canEdit(person)">
                  <option value="coming">Coming</option>
                  <option value="maybe">Maybe</option>
                  <option value="out">Can’t</option>
                </select>
              </label>
              <label class="grow">Arrive <input v-model="person.arrival" type="date" :min="event.start" :max="event.end" :disabled="!canEdit(person)" /></label>
              <label class="grow">Leave <input v-model="person.departure" type="date" :min="event.start" :max="event.end" :disabled="!canEdit(person)" /></label>
            </div>
            <label>Where they’re staying <input v-model="person.lodging" :disabled="!canEdit(person)" placeholder="Blue cottage, inn, or a friend’s house" /></label>
            <button v-if="canEdit(person)" class="btn" type="submit">Save</button>
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
        <button class="btn terra" type="submit">Create invite</button>
        <p v-if="inviteLink">Send this link. They enter once, then this browser remembers them.</p>
        <p v-if="inviteLink"><a :href="inviteLink">{{ inviteLink }}</a></p>
        <p v-if="inviteLink"><a :href="mailto">Email it</a></p>
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
const drafts = reactive({});

const event = computed(() => eventById(route.params.id));
const people = computed(() => (event.value ? peopleFor(event.value.id) : []));
const updates = computed(() => (event.value ? updatesFor(event.value.id) : []));
const organizer = computed(() => isOrganizer(event.value));
const days = computed(() => (event.value ? eachDay(event.value.start, event.value.end) : []));
const mailto = computed(() => {
  if (!inviteLink.value || !event.value) return "";
  const subject = encodeURIComponent(`You’re invited to ${event.value.name}`);
  const body = encodeURIComponent(`Come see the plans: ${inviteLink.value}`);
  return `mailto:${inviteEmail.value}?subject=${subject}&body=${body}`;
});

watch(days, (list) => {
  for (const day of list) {
    if (!drafts[day]) drafts[day] = { title: "", time: "16:00", place: "" };
  }
}, { immediate: true });

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

async function saveStay(person) {
  await savePerson(person, `${person.name} updated arrival, departure, or where they are staying.`);
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
  const record = await invite(event.value, inviteEmail.value);
  inviteLink.value = `${location.origin}/join/${record.token}`;
}

async function onCover(change) {
  const file = change.target.files?.[0];
  if (file) await saveCover(event.value, file);
}
</script>
