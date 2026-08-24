package ai.deepseek.harness.mobile.store

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class EncryptedDeviceStore(context: Context) : DeviceStore {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "dsh_remote_device",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    override var origin: String
        get() = prefs.getString("origin", "").orEmpty()
        set(value) { prefs.edit().putString("origin", value).apply() }

    override var deviceToken: String
        get() = prefs.getString("deviceToken", "").orEmpty()
        set(value) { prefs.edit().putString("deviceToken", value).apply() }

    override var scheme: String
        get() = prefs.getString("scheme", "system").orEmpty().ifEmpty { "system" }
        set(value) { prefs.edit().putString("scheme", value).apply() }

    override var glass: Int
        get() = prefs.getInt("glass", 80)
        set(value) { prefs.edit().putInt("glass", value).apply() }

    override var uiFont: String
        get() = prefs.getString("uiFont", "").orEmpty()
        set(value) { prefs.edit().putString("uiFont", value).apply() }

    override var gitTitle: Boolean
        get() = prefs.getBoolean("gitTitle", true)
        set(value) { prefs.edit().putBoolean("gitTitle", value).apply() }
}
