package pk.nuray.app;

import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int PAGE_LIGHT = 0xFFF5F8F7;
    private static final int PAGE_DARK = 0xFF091614;

    // With an Android System WebView older than 140 the page is kept clear of the status and navigation bars, and the
    // window shows through there. The launch theme leaves the splash image on it (light even in dark mode, with the
    // status icons unreadable), so it gets the page colour of the phone's light or dark mode instead.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PageColorPlugin.class);
        super.onCreate(savedInstanceState);
        boolean night =
            (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        getWindow().getDecorView().setBackgroundColor(night ? PAGE_DARK : PAGE_LIGHT);
    }

    // The sign-in is an httpOnly cookie that changes on every token renewal. The WebView writes cookies to disk only
    // now and then, so an app closed soon after a renewal came back with the spent cookie and was signed out.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
