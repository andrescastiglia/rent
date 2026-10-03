package rent.proximity
import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date
class RentProximityWidget : AppWidgetProvider() {
 override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = refresh(context)
 override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) = refresh(context)
 override fun onReceive(context: Context, intent: Intent) { super.onReceive(context, intent); if(intent.action == EXPIRE) refresh(context) }
 companion object {
  private const val EXPIRE = "rent.proximity.EXPIRE"
  fun refresh(context: Context) {
   val manager = AppWidgetManager.getInstance(context)
   val ids = manager.getAppWidgetIds(ComponentName(context, RentProximityWidget::class.java))
   val data = try { JSONObject(context.getSharedPreferences("rent_proximity",0).getString("snapshot", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
   val enabled = data.optBoolean("enabled",false)
   val expired = data.optBoolean("stale",true) || data.optLong("expiresAt",0) <= System.currentTimeMillis()
   val contact = if(expired) null else data.optJSONObject("contact")
   val updated = data.optLong("updatedAt",0)
   for(id in ids) {
    val views = RemoteViews(context.packageName, R.layout.rent_proximity_widget)
    views.setTextViewText(R.id.rent_proximity_title, if(expired) "Asistencia a visitas" else data.optString("title"))
    views.setTextViewText(R.id.rent_proximity_address, if(expired) { if(enabled) "Ubicación desactualizada" else "Asistencia desactivada" } else data.optString("address"))
    val tall = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT) >= 250
    val lines = mutableListOf<String>()
    if(!expired) {
     val nearby = data.optJSONArray("lines")
     for(i in 0 until minOf(nearby?.length() ?: 0, if(tall) 5 else 2)) lines.add(nearby!!.optString(i))
     val communications = data.optJSONArray("communications")
     for(i in 0 until minOf(communications?.length() ?: 0, if(tall) 5 else 2)) {
      val c = communications!!.optJSONObject(i) ?: continue
      lines.add("${c.optString("createdAt").take(10)} · ${c.optString("channel")} · ${c.optString("summary").take(100)}")
     }
    }
    views.setTextViewText(R.id.rent_proximity_list, lines.joinToString("\n"))
    views.setTextViewText(R.id.rent_proximity_updated, if(updated>0) "Actualizado ${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(updated))}" else "Abrí Rent para activar")
    views.setViewVisibility(R.id.rent_proximity_arrival, if(contact==null) View.GONE else View.VISIBLE)
    fun link(uri: String, request: Int): PendingIntent {
     val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent(Intent.ACTION_VIEW)
     launch.action=Intent.ACTION_VIEW; launch.data=Uri.parse(uri); launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
     return PendingIntent.getActivity(context, request, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    views.setOnClickPendingIntent(R.id.rent_proximity_root,link("rent://proximity",id))
    if(contact!=null) views.setOnClickPendingIntent(R.id.rent_proximity_arrival,link("rent://proximity?contactType=${contact.optString("type")}&contactId=${contact.optString("id")}&arrival=1",id+100000))
    manager.updateAppWidget(id,views)
   }
   val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
   val pending = PendingIntent.getBroadcast(context,0,Intent(context,RentProximityWidget::class.java).setAction(EXPIRE),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
   alarm.cancel(pending)
   if(!expired) alarm.setWindow(AlarmManager.RTC,System.currentTimeMillis()+maxOf(1000,data.optLong("expiresAt")-System.currentTimeMillis()),60000,pending)
   else if(data.has("contact") || data.has("communications")) {
    // Discard CRM text when old; never retain routes, images or prior snapshots.
    val cleared=JSONObject().put("enabled",enabled).put("stale",true).put("updatedAt",updated)
    context.getSharedPreferences("rent_proximity",0).edit().putString("snapshot",cleared.toString()).apply()
   }
  }
 }
}
