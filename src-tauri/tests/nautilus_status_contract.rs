use app_lib::nautilus_simulation::SimulationStatusDto;
use serde_json::{json, Value};

fn round_trip(value: Value) -> Value {
    serde_json::to_value(serde_json::from_value::<SimulationStatusDto>(value).unwrap()).unwrap()
}

#[test]
fn preserves_stream_and_core_market_without_credentials() {
    let base = json!({"state":"RUNNING","started":true,"hasSimulation":true,"simulationProtocolVersion":1});
    for absent in [base.clone(), {
        let mut value = base.clone();
        value["quoteStream"] = Value::Null;
        value["market"] = Value::Null;
        value
    }] {
        assert_eq!(round_trip(absent), base);
    }
    let mut value = base;
    value["quoteStream"] = json!({
        "configured":true,"connected":false,"sourceAvailable":false,"threadAlive":true,
        "framesReceived":0,"decodeErrors":0,"sequenceErrors":0,"reconnectCount":0,
        "lastSequence":null,"lastAppliedAt":null,"quoteAgeMs":null,
        "lastSourceTimestamp":null,"lastLocalAppliedTimestamp":null
    });
    assert_eq!(round_trip(value.clone()), value);
    value["market"] = json!({"instrument":"BTCUSDT-PERP","venue":"SIM","marketType":"perpetual",
        "bestBid":"73000.10","bestAsk":"73000.20","updatedAt":123456789});
    let expected = value.clone();
    value["capabilityToken"] = json!("must-not-leak");
    value["quoteStream"]["reconnectToken"] = json!("must-not-leak");
    value["market"]["Authorization"] = json!("must-not-leak");
    assert_eq!(round_trip(value), expected);
}
