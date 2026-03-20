<script lang="ts">
	let { message }: { message: string } = $props();
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900">
	<div class="max-w-lg px-8 text-center">
		<div class="mb-6 text-5xl text-red-500">!</div>
		<h1 class="mb-4 text-2xl font-bold text-gray-100">Browser Not Supported</h1>
		<p class="text-lg text-gray-300">{message}</p>
	</div>
</div>
