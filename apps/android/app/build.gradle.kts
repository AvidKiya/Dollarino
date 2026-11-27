plugins {
    id("com.android.application")
}

val dollarinoVersionName = providers.gradleProperty("DOLLARINO_VERSION").orElse("11.7.2")
val dollarinoVersionCode = providers.gradleProperty("DOLLARINO_VERSION_CODE").map { it.toInt() }.orElse(110702)
val dollarinoApiBase = providers.gradleProperty("DOLLARINO_API_BASE").orElse("https://dollarino.pages.dev")

android {
    namespace = "com.dollarino.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.dollarino.app"
        minSdk = 24
        targetSdk = 35
        versionCode = dollarinoVersionCode.get()
        versionName = dollarinoVersionName.get()

        buildConfigField("String", "DEFAULT_API_BASE", "\"${dollarinoApiBase.get()}\"")
        resourceConfigurations += listOf("fa", "en")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    buildFeatures {
        buildConfig = true
    }

    androidResources {
        noCompress += listOf("woff2", "woff", "ttf", "json")
    }

    packaging {
        resources {
            excludes += listOf("META-INF/LICENSE*", "META-INF/NOTICE*", "META-INF/*.kotlin_module")
        }
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core:1.15.0")
    implementation("androidx.activity:activity:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.work:work-runtime:2.10.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
