package pk.nuray.app;

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The sign-in is an httpOnly cookie that changes on every token renewal. The WebView writes cookies to disk only
    // now and then, so an app closed soon after a renewal came back with the spent cookie and was signed out.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
