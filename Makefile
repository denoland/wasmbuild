install:
	deno install --unstable -A -f -n wasmbuild ./main.ts

fmt:
	deno fmt --ignore=./tests/target
	cd tests && cargo fmt

test: install
	cd tests \
	&& wasmbuild \
	&& deno test -A

