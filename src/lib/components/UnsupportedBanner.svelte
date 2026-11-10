<script lang="ts">
	let { message }: { message: string } = $props();
</script>

<div class="flex flex-1 items-start justify-center px-6 py-16">
	<div class="panel max-w-xl p-8">
		<h1 class="text-[26px] font-bold leading-tight">This browser cannot reach the dongle</h1>
		<p class="mt-3 text-[var(--fs-section)] leading-snug text-[var(--muted)]">{message}</p>
		<p class="meta mt-6">
			WebUSB is available in Chrome and Edge on macOS, Linux and Windows. Safari and Firefox do not
			implement it.
		</p>
	</div>
</div>
