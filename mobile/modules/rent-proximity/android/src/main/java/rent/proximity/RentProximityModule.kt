package rent.proximity
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
class RentProximityModule : Module() {
 override fun definition() = ModuleDefinition {
  Name("RentProximity")
  Function("update") { snapshot: String ->
   val context = appContext.reactContext ?: return@Function
   context.getSharedPreferences("rent_proximity", 0).edit().putString("snapshot", snapshot).apply()
   RentProximityWidget.refresh(context)
  }
 }
}
