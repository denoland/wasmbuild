install:
	deno install --unstable -A -f -n wasmbuild ./main.ts

fmt:
	deno fmt --ignore=./tests/target
	cd tests && cargo fmt

test: install
	cd tests \
	&& deno run --unstable -A ../main.ts \
	&& deno test -A

