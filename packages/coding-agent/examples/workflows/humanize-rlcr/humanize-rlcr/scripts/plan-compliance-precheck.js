return {
	summary: "plan compliance precheck passed",
	statePatch: [
		{
			op: "set",
			path: "/humanize",
			value: {
				precheck: {
					status: "pass",
					branchSwitching: false,
				},
			},
		},
	],
};
