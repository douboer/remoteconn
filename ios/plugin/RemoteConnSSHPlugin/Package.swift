// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RemoteConnSSHPlugin",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "RemoteConnSSHPlugin", targets: ["RemoteConnSSHPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")
    ],
    targets: [
        .target(
            name: "RemoteConnSSHPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm")
            ],
            path: "Sources/RemoteConnSSHPlugin"
        ),
        .testTarget(
            name: "RemoteConnSSHPluginTests",
            dependencies: ["RemoteConnSSHPlugin"],
            path: "Tests/RemoteConnSSHPluginTests"
        )
    ]
)
