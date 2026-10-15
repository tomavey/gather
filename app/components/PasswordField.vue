<template>
  <label>
    {{ label }}
    <span class="password-field">
      <input
        :value="modelValue"
        :type="shown ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :required="required"
        :minlength="minlength"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <button
        type="button"
        :aria-pressed="shown"
        :aria-label="shown ? 'Hide password' : 'Show password'"
        @click="shown = !shown"
      >
        <svg v-if="shown" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9.5 4.2 11 7-0.6 1.1-1.5 2.3-2.6 3.4" />
          <path d="M6.1 6.1C4.2 7.4 2.7 9.1 1 12c1.5 2.8 5.5 7 11 7 1.6 0 3.1-.3 4.4-.9" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </span>
  </label>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  modelValue: { type: String, default: "" },
  autocomplete: { type: String, default: "current-password" },
  required: { type: Boolean, default: false },
  minlength: { type: [String, Number], default: undefined },
});
defineEmits(["update:modelValue"]);
const shown = ref(false);
</script>
