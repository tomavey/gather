<script setup>
const route = useRoute()
const next = typeof route.query.next === 'string' ? route.query.next : '/'
const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/'
const target = safe.replace(/\/people\/?$/, '') || '/'

await navigateTo(target, { replace: true })
</script>
