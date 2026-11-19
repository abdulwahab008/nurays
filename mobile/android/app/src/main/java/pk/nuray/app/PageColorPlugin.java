package pk.nuray.app;

import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The page tells the app its background colour when its theme is set or changed, so what shows around the page (with a
 * WebView older than 140 the page is kept clear of the system bars) matches the theme chosen in the app, not only the
 * phone's light or dark mode.
 */
@CapacitorPlugin(name = "PageColor")
public class PageColorPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        int colour;
        try {
            colour = Color.parseColor(call.getString("color", ""));
        } catch (IllegalArgumentException e) {
            call.reject("Not a colour");
            return;
        }
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(colour);
            call.resolve();
        });
    }
}
