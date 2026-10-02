## [1.18.0](https://github.com/Lautstark/sicherung/compare/v1.17.3...v1.18.0) (2026-10-02)

### Features

* **ablage:** a product says which kinds hold files, and remove lists only those ([bc178a1](https://github.com/Lautstark/sicherung/commit/bc178a1ab874822292f6f3bf7405b6a8eb692e4f))

## [1.17.3](https://github.com/Lautstark/sicherung/compare/v1.17.2...v1.17.3) (2026-10-02)

### Bug Fixes

* **ablage:** a mark that cannot be read stops adoption, and a read that breaks off stops all() ([0e90a9d](https://github.com/Lautstark/sicherung/commit/0e90a9dfffc55cfc149b935dea7a8618cf07dd5b)), closes [#reach](https://github.com/Lautstark/sicherung/issues/reach)

## [1.17.2](https://github.com/Lautstark/sicherung/compare/v1.17.1...v1.17.2) (2026-10-01)

### Bug Fixes

* **ablage:** a follower cannot nest, and is not offered choose or forget ([3912623](https://github.com/Lautstark/sicherung/commit/391262373b03daa3d4fcea1f992913bccbd27fd2))
* **ablage:** an unreachable folder is stale, not empty ([7460bfe](https://github.com/Lautstark/sicherung/commit/7460bfe5bc27845dd9070fb65837907aa191177f)), closes [#dir](https://github.com/Lautstark/sicherung/issues/dir)
* **ablage:** refuse an id that could never be read back ([59da562](https://github.com/Lautstark/sicherung/commit/59da562eaa66d96f4395671f45370ceb07881f3f))
* **ablage:** removing a record that is already gone is done, not stale ([f61718b](https://github.com/Lautstark/sicherung/commit/f61718b67cd208b036d7ad72bfee21a4a0e2972c))
* **ablage:** resolve keeps every candidate unless the chosen one landed ([41283ce](https://github.com/Lautstark/sicherung/commit/41283cea6e1f07c4b2fa29c48d18f55d44425757))
* **panel:** closing the picker behind "Anderer Ordner" costs nothing ([46b00a4](https://github.com/Lautstark/sicherung/commit/46b00a453d70edb9959fc2bfd036f86750836126))
* **panel:** offer a follower only what it can do, and catch every press ([a60081d](https://github.com/Lautstark/sicherung/commit/a60081ddd5ab4e4c1388ada904e2152e24151a17))
* **rescue:** the download is taken once, with both buttons shut meanwhile ([a74c61c](https://github.com/Lautstark/sicherung/commit/a74c61c567e8970a2f46937cd05c02184246922c))
* **sicherung:** a different folder starts without the old one's mark ([09dcc42](https://github.com/Lautstark/sicherung/commit/09dcc4208a66afc5422e6680df06835e497dca63)), closes [#take](https://github.com/Lautstark/sicherung/issues/take)
* **sicherung:** a write in flight stops when its folder is forgotten ([c232c8e](https://github.com/Lautstark/sicherung/commit/c232c8ee90a49653429f8920a9edc8550c6ed16b)), closes [#run](https://github.com/Lautstark/sicherung/issues/run) [this.#folder](https://github.com/Lautstark/this./issues/folder) [#dirty](https://github.com/Lautstark/sicherung/issues/dirty)
* **sicherung:** escape the stem before pruning by it ([67b7477](https://github.com/Lautstark/sicherung/commit/67b747710d5ebce3f169ec7cb7d579a705b20b17)), closes [#prune](https://github.com/Lautstark/sicherung/issues/prune)

## [1.17.1](https://github.com/Lautstark/sicherung/compare/v1.17.0...v1.17.1) (2026-09-17)

### Bug Fixes

* the panels import the published entries, not this package's src ([e6ecd7c](https://github.com/Lautstark/sicherung/commit/e6ecd7ceb906a6dfe424d4fc167b95b19970a203)), closes [#private](https://github.com/Lautstark/sicherung/issues/private) [#options](https://github.com/Lautstark/sicherung/issues/options) [#folder](https://github.com/Lautstark/sicherung/issues/folder) [#status](https://github.com/Lautstark/sicherung/issues/status) [#listeners](https://github.com/Lautstark/sicherung/issues/listeners)

## [1.17.0](https://github.com/Lautstark/sicherung/compare/v1.16.1...v1.17.0) (2026-09-17)

### Features

* the two panels and the rescue sheet, as Svelte components ([2f96719](https://github.com/Lautstark/sicherung/commit/2f9671979d5ca69b975afc734f7063e5458dae5c))
