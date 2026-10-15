<template>
  <main class="shell">
    <header class="top">
      <NuxtLink class="brand" to="/"><strong>GatheredHub</strong></NuxtLink>
    </header>
    <p v-if="!ready">Opening your invite…</p>
    <section v-else-if="!invite" class="card" style="padding: 18px">
      <h1>This invite is not on this hub.</h1>
      <p>Ask the organizer to send a new link.</p>
    </section>
    <section v-else class="grid two">
      <div>
        <p class="kicker">You’re invited</p>
        <h1>{{ event?.name }}</h1>
        <p>{{ formatDay(event?.start) }} – {{ formatDay(event?.end) }}</p>
        <p>{{ event?.place }}</p>
      </div>
      <form class="card form" style="padding: 18px" @submit.prevent="join">
        <label>Name <input v-model="name" required /></label>
        <label>Email <input :value="invite.email" disabled /></label>
        <label>Cell phone <input v-model="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="555-555-5555" /></label>
        <PasswordField v-model="password" label="Password" autocomplete="new-password" required minlength="6" />
        <PasswordField v-model="passwordAgain" label="Confirm password" autocomplete="new-password" required minlength="6" />
        <p v-if="formError" class="error">{{ formError }}</p>
        <p class="muted">This password is how you open the gathering on another phone or computer.</p>
        <button class="btn terra" type="submit">Enter the hub</button>
      </form>
    </section>
  </main>
</template>

<script setup>
const route = useRoute();
const hub = useHub();
const { ready, state, eventById, acceptInvite, formatDay } = hub;
const name = ref("");
const phone = ref("");
const password = ref("");
const passwordAgain = ref("");
const formError = ref("");

const invite = computed(() =>
  state.value.invites.find((item) => item.token === route.params.token),
);
const event = computed(() => (invite.value ? eventById(invite.value.eventId) : null));

async function join() {
  const digits = phone.value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    formError.value = "Enter a cell phone number with at least 10 digits.";
    return;
  }
  if (password.value.length < 6) {
    formError.value = "Use a password with at least 6 characters.";
    return;
  }
  if (password.value !== passwordAgain.value) {
    formError.value = "Those passwords do not match.";
    return;
  }
  formError.value = "";
  try {
    const next = await acceptInvite(route.params.token, name.value, phone.value.trim(), password.value);
    if (next) await navigateTo(`/events/${next.id}`);
  } catch (cause) {
    formError.value = cause.message || "Could not create the account.";
  }
}
</script>
