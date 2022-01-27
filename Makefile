install:
	deno install --unstable -A -f -n wasmbuild ./main.ts

fmt:
	deno fmt --ignore=./test/target
	cd test && cargo fmt

test: install
	cd test \
	&& wasmbuild \
	&& deno test -A

