<script lang="ts">
	import '../app.css';
	import StatusBar from '$lib/components/StatusBar.svelte';

	let { children } = $props();
</script>

<div class="flex min-h-screen flex-col">
	<StatusBar />
	{@render children()}
</div>
